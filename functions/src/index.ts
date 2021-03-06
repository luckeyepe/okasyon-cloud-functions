import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {strictEqual} from "assert";
import {Console} from "inspector";
import enableLogging = admin.database.enableLogging;

admin.initializeApp();

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

//only fires up when a message for a user is written in the latest messages
exports.notifyNewNotificationMessage = functions.firestore
    .document('Notification_Massages/{message}')
    .onWrite((change, context) => {
        const document = change.after.exists ? change.after.data() : null;
        const docSnaphshot = document;

        //grab and save the data from the message
        const message = docSnaphshot;
        const recieverID = message.message_recieverID
        const senderName = message.message_senderName
        console.log("Receiver ID: "+recieverID);
        console.log("Sender Name: "+senderName);

        // admin.firestore().doc('path/to/doc').get().then(snapshot => {
        //     const data = snapshot.data()  // a plain JS object
        // })
        return admin.firestore().doc('Users/'+recieverID).get().then(userDoc => {
            //grab device token from the user
            const recieverUser = userDoc.data();
            const receiverToken = recieverUser['user_token'];

            console.log("Receiver Name: "+recieverUser['user_firstName']);
            console.log("Receiver Token: "+receiverToken);

            /*structure of the notification
            title: title of the notification
            body: message of the notification
            click: (optional) launches action from manifest
            */

            //check if the massage is text or image, and then assigns a value for the notification's body
            // const notificationBody = (message['message_type'] === "text") ? message['message_messageContent']: "You received a new image message";
            var notificationBody = "";
            switch (message['message_type']) {
                case "text":
                    notificationBody = message['message_messageContent'];
                    break;

                case "image":
                    notificationBody = "You received a new image message";
                    break;

                case "emergency":
                    notificationBody = "Please help me";
                    break;
            }

            const payload = {
                notification:{
                    title: senderName + " sent you a message",
                    body: notificationBody,
                    click: "ChatLogActivity"
                }
            };

            console.log("Notification Title: "+payload.notification.title);
            console.log("Notification Message: "+payload.notification.body);

            return admin.messaging().sendToDevice(receiverToken, payload);
        });
    });

exports.logNewUser = functions.region('asia-northeast1').firestore
.document('Users/{user}')
.onCreate((documentSnapshot, context) =>{
    const user = documentSnapshot.data();
    const userDeviceToken = user['user_token'];
    const userName = ""+user['user_firstName']+" "+user['user_lastName'];
    console.log("User Device Token: "+userDeviceToken);
    console.log("User Full Name: "+userName);

    return admin.firestore().doc('User/'+documentSnapshot.id).update({
        user_profPic: 'default'
    })
});

exports.logNewStores = functions.region('asia-northeast1').firestore
.document('Store/{store}')
.onCreate((documentSnapshot, context) =>{
    const store = documentSnapshot.data();
    const storeName = store['store_store_name'];
    const storeOwnerUid = store['store_owner_id'];
    console.log("Store Name: "+storeName);
    console.log("Store Owner ID: "+storeOwnerUid); 
});

function arrayContains(badWords: string[], word: string):boolean {
    return badWords.indexOf(word) > -1;
}

function isNumber(value: string | number): boolean
{
    return !isNaN(Number(value));
}

export const cleanTheItemDoc = functions.region('asia-northeast1').firestore.document('Items/{itemID}')
    .onUpdate((change, context) =>{
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['item_doc'] === itemBefore['item_doc']){
            console.log('This item has no new name, description, or price description');
            return null;
        } else {
            console.log('This item has new data');
            //clean the document string
            const dirtyString:string = itemAfter['item_doc'];
            const badWords:string[] = ["a","an","the","I", "and", "but", "or", "nor", "for",
                "yet", "it", "they", "him", "her", "them", "of"];

            const dirtyStringArray: string[] = dirtyString
                .replace(/[^\w\s]|_/g, function ($1) {
                    return ' ' + $1 + ' ';
                })
                .replace(/[ ]+/g, ' ')
                .split(' ');

            const cleanStringArray: string[] = [];

            console.log('Dirty string array '+dirtyStringArray);

            dirtyStringArray.forEach(function (dirtyWord){
                console.log('Dirty Word'+dirtyWord);
                if (dirtyWord.length>1){
                    if (!arrayContains(badWords, dirtyWord)){
                        cleanStringArray.push(dirtyWord.toLowerCase());
                    }
                }else {
                    if (isNumber(+dirtyWord)){
                        cleanStringArray.push(dirtyWord.toLowerCase());
                    }
                }
            });

            let cleanDoc = '';

            cleanStringArray.forEach(function (cleanWord) {
                cleanDoc = cleanDoc.concat(' ',cleanWord);
            });

            cleanDoc = cleanDoc.trimLeft();
            cleanDoc = cleanDoc.trimRight();

            return admin.firestore().collection('Items').doc(itemAfter['item_uid']).update({
                item_doc:cleanDoc
            })
        }

    });

exports.logNewItems = functions.region('asia-northeast1').firestore
.document('Items/{item}')
.onCreate(async (snapshot, context) => {
    const item = snapshot.data();
    const itemName = item['item_name'];
    const storeUid = item['item_store_id'];
    const itemUid = item['item_uid'];
    const itemCategory = item['item_category_id'];

    console.log("Item Name: " + itemName);
    console.log("Store ID: " + storeUid);

    //increase the amount of items in an item category
    const itemCategoryPromise = await admin.firestore()
        .collection('Number_of_Items')
        .doc(itemCategory).get();

    const categoryDoc = itemCategoryPromise.data();
    const increasedCategorySize:number = categoryDoc['number_of_items_in_category'] + 1;
    console.log(itemCategory+"'s size has now been increased to "+increasedCategorySize);

    const increaseCategoryPromise = await admin.firestore()
        .collection('Number_of_Items')
        .doc(itemCategory).update({
            number_of_items_in_category:  increasedCategorySize
        });

    console.log('Updated the amount of items in the '+itemCategory+' Item Category to '+increasedCategorySize);

    const totalPromise = await admin.firestore()
        .collection('Number_of_Items')
        .doc('Total').get();

    const totalDoc = itemCategoryPromise.data();
    const increasedTotalSize:number =  totalDoc['number_of_items_in_category']+ 1;
    console.log("Total number of items has now been increased to "+increasedTotalSize
        +' from '+totalDoc['number_of_items_in_category']);

    const increaseTotalPromise = await admin.firestore()
        .collection('Number_of_Items')
        .doc('Total').update({
            number_of_items_in_category: increasedCategorySize
        });

    console.log('Updated the total amount of items to '+ increasedTotalSize);

    return;
});

export const onItemDelete = functions
    .firestore
    .document('Items/{itemID}')
    .onDelete(async (snapshot, context) => {
        const deletedItem = snapshot.data();
        const itemName = deletedItem['item_name'];
        const storeUid = deletedItem['item_store_id'];
        const itemUid = deletedItem['item_uid'];
        const itemCategory = deletedItem['item_category_id'];

        console.log("Item Name: " + itemName);
        console.log("Store ID: " + storeUid);

        //delete item from TF collection
        const deleteTFPromise = await admin.firestore().doc('TF/tf/'+itemCategory+'/'+itemUid).delete();
        console.log('Deleted the item: '+itemUid+' from the TF collection');

        //delete item from IDF collection
        const deleteIDFPromise = await admin.firestore().doc('IDF/idf/'+itemCategory+'/'+itemUid).delete();
        console.log('Deleted the item: '+itemUid+' from the IDF collection');

        //delete item from Item_Profile collection
        const deleteItemProfilePromise = await admin.firestore().doc('Item_Profile/'+itemUid).delete();
        console.log('Deleted the item: '+itemUid+' from the Item_Profile collection');

        //decrease the amount of items in an item category
        const itemCategoryPromise = await admin.firestore()
            .collection('Number_of_Items')
            .doc(itemCategory).get();

        const decreasedCategorySize:number = itemCategoryPromise.data()['number_of_items_in_category'] - 1;

        const decreaseCategoryPromise = await admin.firestore()
            .collection('Number_of_Items')
            .doc(itemCategory).update({
                number_of_items_in_category: decreasedCategorySize
            });

        console.log('Updated the amount of items in the '+itemCategory+' Item Category to '+decreasedCategorySize);

        //decrease the total amount of items
        const totalPromise = await admin.firestore()
            .collection('Number_of_Items')
            .doc(itemCategory).get();

        const decreasedTotalSize:number = itemCategoryPromise.data()['number_of_items_in_category'] - 1;

        const decreaseTotalPromise = await admin.firestore()
            .collection('Number_of_Items')
            .doc('Total').update({
                number_of_items_in_category: decreasedTotalSize
            });

        console.log('Updated the total amount of items to '+ decreasedTotalSize);
        return
    });

export const onItemDocUpdate = functions
    .firestore
    .document('Items/{itemID}').onUpdate((change, context) =>{
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        console.log("After: "+ itemAfter['item_name']+", Before: "+ itemBefore['item_name']);
        console.log("After: "+ itemAfter['item_description']+", Before: "+ itemBefore['item_description']);
        console.log("After: "+ itemAfter['item_price_description']+", Before: "+ itemBefore['item_price_description']);
        console.log("After: "+ itemAfter['item_uid']+", Before: "+ itemBefore['item_uid']);

        if (itemAfter['item_name'] === itemBefore['item_name']
            && itemAfter['item_description'] === itemBefore['item_description']
            && itemAfter['item_price_description'] === itemBefore['item_price_description']
            && itemAfter['item_tag'] === itemBefore['item_tag']
            && itemAfter['item_uid'] === itemBefore['item_uid']){

            console.log("Item has no new data");

            return null;
        }else {
            console.log("Item has updated data");

            const itemName = itemAfter['item_name'];
            const itemDescription: string = itemAfter['item_description'];
            const itemPriceDescription: string = itemAfter['item_price_description'];
            const itemTags: string = itemAfter['item_tag'];
            const itemDoc: string = itemName.concat(" ", itemDescription, " ",
                itemPriceDescription, " ",
                itemTags);

            return admin.firestore().collection('Items').doc(itemAfter['item_uid']).update({item_doc: itemDoc});
        }
    });

export const updateTF = functions.region('asia-northeast1').firestore.document('Items/{itemID}')
    .onUpdate(async (change, context) =>{
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['item_doc'] === itemBefore['item_doc']){

            console.log("Item has no new data, no need to update tfidf");

            return null;
        }else {
            console.log("Item has updated data");
            const itemDoc:string = itemAfter['item_doc'];
            let uniqueWordCount:number = 0;
            let totalWordCount:number;
            const uniqueWordArray:string[] = [];
            const wordCountArray:number[] = [];

            const cleanWordArray = itemDoc.split(' ');
            totalWordCount = cleanWordArray.length;

            cleanWordArray.forEach(function (cleanWord) {
                if (!arrayContains(uniqueWordArray, cleanWord)){
                    uniqueWordArray.push(cleanWord);
                    uniqueWordCount++;
                    wordCountArray.push(1);
                }else {
                    const uniqueWordIndex = uniqueWordArray.indexOf(cleanWord);
                    wordCountArray[uniqueWordIndex] = wordCountArray[uniqueWordIndex]+1;
                }
            });

            const tfArray:number[] = [];

            for(let i =0; i<wordCountArray.length; i++){
                tfArray[i] = (wordCountArray[i])/totalWordCount;
            }

            try{
                await admin.firestore().collection('TF').doc('tf').collection(itemAfter['item_category_id'])
                    .doc(itemAfter['item_uid'])
                    .update({
                        tf_unique_word_count: uniqueWordCount,
                        tf_total_word_count: totalWordCount,
                        tf_unique_words: uniqueWordArray,
                        tf_unique_words_count: wordCountArray,
                        tf_item_uid: itemAfter['item_uid'],
                        tf_tf_score: tfArray
                    });

                console.log("Updated the tf value of the item: "+
                    itemAfter['item_uid']
                    +"which belongs to the "+itemAfter['item_category_id']+" Category");

            }catch (e) {
                await admin.firestore().collection('TF').doc('tf').collection(itemAfter['item_category_id'])
                    .doc(itemAfter['item_uid'])
                    .set({
                        tf_unique_word_count: uniqueWordCount,
                        tf_total_word_count: totalWordCount,
                        tf_unique_words: uniqueWordArray,
                        tf_unique_words_count: wordCountArray,
                        tf_item_uid: itemAfter['item_uid'],
                        tf_tf_score: []
                    });

                await admin.firestore().collection('TF').doc('tf').collection(itemAfter['item_category_id'])
                    .doc(itemAfter['item_uid'])
                    .update({
                        tf_unique_word_count: uniqueWordCount,
                        tf_total_word_count: totalWordCount,
                        tf_unique_words: uniqueWordArray,
                        tf_unique_words_count: wordCountArray,
                        tf_item_uid: itemAfter['item_uid'],
                        tf_tf_score: tfArray
                    });

                console.log("Wrote and Updated the tf value of the item: "+
                    itemAfter['item_uid']
                    +"which belongs to the "+itemAfter['item_category_id']+" Category");
            }

            return
        }
    });

async function getNumberOfItemsInCategory(itemCategory: string): Promise<number>{
    const snapshot = await admin.firestore().collection('Number_of_Items')
        .doc(itemCategory)
        .get();
    const data = snapshot.data();
    const numberOfItems:number = data['number_of_items_in_category'];

    console.log("Method: Number of Items in the category: "+itemCategory+"is "+numberOfItems);

    return numberOfItems;
}

async function getItemsThatContainAWord(word: string, itemCategory: string): Promise<string[]>{
    const itemIDArray:string[] = [];

    const snapshot = await admin.firestore().collection('TF')
        .doc('tf').collection(itemCategory).
        where("tf_unique_words", "array-contains", word).get();

    const docs = snapshot.docs;

    docs.forEach(function (document) {
        itemIDArray.push(document.data()['tf_item_uid'])
    });

    console.log("Method: Number of Items that the word: "+word+" exist is "+itemIDArray.length);

    return itemIDArray;
}


async function getIDFWeightArray(tfWords: string[], itemCategory: string):Promise<number[]> {
    const promiseArray: number[] = [];
    const numberOfItems = await getNumberOfItemsInCategory(itemCategory);
    console.log("Number of Items in the category: "+itemCategory+" is " + numberOfItems);

    for(const tfword in tfWords){
        const resultItemArray = await getItemsThatContainAWord(tfWords[Number(tfword)], itemCategory);
        console.log("Number of Items that the word: " + tfWords[Number(tfword)] + " exist is " + resultItemArray.length);

        const result: number = Math.log10(numberOfItems/resultItemArray.length)+1;

        promiseArray.push(result);
        console.log("In Loop: Promise Array Value: " + promiseArray);
    }

    console.log("Outside Loop: Promise Array Value: " + promiseArray);
    return promiseArray;
}

async function writeToIDFCollection(tfItemUid: string, itemCategory: string,tfWords: string[], weightArray: number[]) {
    const writePromise =  admin.firestore()
        .collection('IDF')
        .doc('idf')
        .collection(itemCategory)
        .doc(tfItemUid).set({
            idf_item_uid: tfItemUid,
            idf_words: tfWords,
            idf_weight: weightArray
        });
    console.log("The IDF for the item "+tfItemUid+" has been updated");

    return writePromise;
}

async function writeToItemProfileCollection(tfItemUid: string, itemCategory: string,tfWords: string[], tfidfArray: number[]) {
    const writePromise = await admin.firestore().collection('Item_Profile')
        .doc(tfItemUid)
        .set({
            item_profile_item_uid: tfItemUid,
            item_profile_item_category: itemCategory,
            item_profile_attribute_words: tfWords,
            item_profile_attribute_weights: tfidfArray
        });
    console.log("The Item_Profile for the item "+tfItemUid+" has been updated");

    return writePromise;
}

export const updateCakeAndPastriesIDF = functions.firestore.document("TF/tf/Cake_and_Pastries/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Cake and Pastries');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Cake_and_Pastries').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Cake_and_Pastries');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Cake_and_Pastries',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Cake_and_Pastries',tfWords, tfidfArray);
            });

            console.log("The Entire Cake and Pastries IDF has been updated");
            return null;
        }
    });

export const updateCakeAndPastriesIDFOnItemDelete = functions.firestore.document("TF/tf/Cake_and_Pastries/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        // const deletedTf = snapshot.data();

        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Cake_and_Pastries').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Cake and Pastries');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Cake_and_Pastries').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Cake_and_Pastries');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Cake_and_Pastries', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Cake_and_Pastries', tfWords, tfidfArray);
            });

            console.log("The Entire Cake and Pastries IDF has been updated");
            return null;
        }
    });

export const updateGownsIDF = functions.firestore.document("TF/tf/Gowns/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Gowns');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Gowns').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Gowns');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Gowns',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Gowns',tfWords, tfidfArray);
            });

            console.log("The Entire Gowns IDF has been updated");
            return null;
        }
    });

export const updateGownsIDFOnItemDelete = functions.firestore.document("TF/tf/Gowns/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Gowns').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Gowns');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Gowns').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Gowns');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Gowns', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Gowns', tfWords, tfidfArray);
            });

            console.log("The Entire Gowns IDF has been updated");
            return null;
        }
    });

export const updateCateringServiceIDF = functions.firestore.document("TF/tf/Catering_Service/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Catering_Service');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Catering_Service').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Catering_Service');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Catering_Service',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Catering_Service',tfWords, tfidfArray);
            });

            console.log("The Entire Catering_Services IDF has been updated");
            return null;
        }
    });

export const updateCateringServiceIDFOnItemDelete = functions.firestore.document("TF/tf/Catering_Service/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Catering_Service').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Catering_Service');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Catering_Service').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Catering_Service');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Catering_Service', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Catering_Service', tfWords, tfidfArray);
            });

            console.log("The Entire Catering_Service IDF has been updated");
            return null;
        }
    });

export const updateChurchIDF = functions.firestore.document("TF/tf/Church/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Church');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Church').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Church');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Church',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Church',tfWords, tfidfArray);
            });

            console.log("The Entire Church IDF has been updated");
            return null;
        }
    });

export const updateDJIDF = functions.firestore.document("TF/tf/DJ/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the DJ');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('DJ').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'DJ');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'DJ',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'DJ',tfWords, tfidfArray);
            });

            console.log("The Entire DJ IDF has been updated");
            return null;
        }
    });

export const updateEventCoordinatorIDF = functions.firestore.document("TF/tf/Event_Coordinator/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Event_Coordinator');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Event_Coordinator').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Event_Coordinator');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Event_Coordinator',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Event_Coordinator',tfWords, tfidfArray);
            });

            console.log("The Entire Event_Coordinator IDF has been updated");
            return null;
        }
    });

export const updateEventEntertainerIDF = functions.firestore.document("TF/tf/Event_Entertainer/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Event_Entertainer');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Event_Entertainer').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Event_Entertainer');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Event_Entertainer',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Event_Entertainer',tfWords, tfidfArray);
            });

            console.log("The Entire Event_Entertainer IDF has been updated");
            return null;
        }
    });

export const updateEventStylistIDF = functions.firestore.document("TF/tf/Event_Stylist/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Event_Stylist');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Event_Stylist').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Event_Stylist');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Event_Stylist',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Event_Stylist',tfWords, tfidfArray);
            });

            console.log("The Entire Event_Stylist IDF has been updated");
            return null;
        }
    });

export const updateFlowersIDF = functions.firestore.document("TF/tf/Flowers/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Flowers');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Flowers').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Flowers');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Flowers',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Flowers',tfWords, tfidfArray);
            });

            console.log("The Entire Flowers IDF has been updated");
            return null;
        }
    });

export const updateFoodIDF = functions.firestore.document("TF/tf/Food/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Food');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Food').get();

            const itemDocs = querySnapshot.docs;
            console.log("There are "+itemDocs.length+" items in the Food Category");

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Food');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Food',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Food',tfWords, tfidfArray);
            });

            console.log("The Entire Food IDF has been updated");
            return null;
        }
    });

export const updateHair_and_Make_upIDF = functions.firestore.document("TF/tf/Hair_and_Make-up/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Hair_and_Make-up');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Hair_and_Make-up').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Hair_and_Make-up');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Hair_and_Make-up',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Hair_and_Make-up',tfWords, tfidfArray);
            });

            console.log("The Entire Hair_and_Make-up IDF has been updated");
            return null;
        }
    });

export const updateHostIDF = functions.firestore.document("TF/tf/Host/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Host');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Host').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Host');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Host',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Host',tfWords, tfidfArray);
            });

            console.log("The Entire Host IDF has been updated");
            return null;
        }
    });

export const updateJewelryIDF = functions.firestore.document("TF/tf/Jewelry/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Jewelry');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Jewelry').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Jewelry');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Jewelry',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Jewelry',tfWords, tfidfArray);
            });

            console.log("The Entire Jewelry IDF has been updated");
            return null;
        }
    });

export const updateLightsIDF = functions.firestore.document("TF/tf/Lights/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Lights');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Lights').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Lights');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Lights',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Lights',tfWords, tfidfArray);
            });

            console.log("The Entire Lights IDF has been updated");
            return null;
        }
    });

export const updatePhotographyIDF = functions.firestore.document("TF/tf/Photography/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Photography');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Photography').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Photography');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Photography',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Photography',tfWords, tfidfArray);
            });

            console.log("The Entire Photography IDF has been updated");
            return null;
        }
    });

export const updatePrintedMaterialsIDF = functions.firestore.document("TF/tf/Printed_Materials/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Printed_Materials');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Printed_Materials').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Printed_Materials');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Printed_Materials',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Printed_Materials',tfWords, tfidfArray);
            });

            console.log("The Entire Printed_Materials IDF has been updated");
            return null;
        }
    });

export const updateSoundsIDF = functions.firestore.document("TF/tf/Sounds/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Sounds');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Sounds').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Sounds');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Sounds',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Sounds',tfWords, tfidfArray);
            });

            console.log("The Entire Sounds IDF has been updated");
            return null;
        }
    });

export const updateSuitsIDF = functions.firestore.document("TF/tf/Suits/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Suits');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Suits').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Suits');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Suits',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Suits',tfWords, tfidfArray);
            });

            console.log("The Entire Suits IDF has been updated");
            return null;
        }
    });

export const updateVenueIDF = functions.firestore.document("TF/tf/Venue/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Venue');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Venue').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Venue');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Venue',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Venue',tfWords, tfidfArray);
            });

            console.log("The Entire Venue IDF has been updated");
            return null;
        }
    });

export const updateVideographyIDF = functions.firestore.document("TF/tf/Videography/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Videography');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Videography').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Videography');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Videography',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Videography',tfWords, tfidfArray);
            });

            console.log("The Entire Videography IDF has been updated");
            return null;
        }
    });

export const updateWeddingVehicleIDF = functions.firestore.document("TF/tf/Wedding_Vehicle/{itemCategory}")
    .onUpdate(async (change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Wedding_Vehicle');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Wedding_Vehicle').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray:number[] = await getIDFWeightArray(tfWords, 'Wedding_Vehicle');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Wedding_Vehicle',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Wedding_Vehicle',tfWords, tfidfArray);

            });

            console.log("The Entire Wedding_Vehicle IDF has been updated");
            return null;
        }
    });

//function that returns a list of item from a search query
export const searchForItem = functions.https.onCall(async (data, context)=>{
    const searchString:string = data.query;
    const searchItemCategory:string = data.item_category;
    const user_uid = data.current_user_uid;
    let searchQueryArray:string[] = [];
    const searchTags:string[] = [];
    const relateItemUids:string[] = [];
    const uniqueWordArray:string[] = [];
    const wordCountArray:number[] = [];
    const relatedItemMap = [];

    console.log("Search string for the item is "+searchString);

    if (searchString.indexOf(' ') > -1){
        searchQueryArray = searchString.split(" ");
    } else {
        searchQueryArray.push(searchString)
    }

    //clean up the search query
    for(let i=0; i<searchQueryArray.length; i++){
        searchTags.push(searchQueryArray[i])
    }

    searchTags.forEach(function (searchTag) {
        if (!arrayContains(uniqueWordArray, searchTag)){
            uniqueWordArray.push(searchTag);
            wordCountArray.push(1);
        }else {
            const uniqueWordIndex = uniqueWordArray.indexOf(searchTag);
            wordCountArray[uniqueWordIndex] = wordCountArray[uniqueWordIndex]+1;
        }
    });


    console.log("Looking for items that belong to the "+searchItemCategory+" category");
    //get items with the same item category
    const querySnapshot = await admin.firestore().collection('Item_Profile')
        .where("item_profile_item_category", "==", searchItemCategory).get();

    const resultDocs = querySnapshot.docs;
    console.log('There are '+resultDocs.length+' in the '+searchItemCategory);

    const readPromise = await resultDocs.forEach(async function (doc) {
        const itemProfile = doc.data();
        const itemUid = itemProfile['item_profile_item_uid'];
        const itemProfileAttributeWords:string[] = itemProfile['item_profile_attribute_words'];
        const itemProfileAttributeWeight:number[] = itemProfile['item_profile_attribute_weights'];
        let itemScore:number = 0;

        uniqueWordArray.forEach(function (attributeWord) {
            console.log(itemProfileAttributeWords);
            console.log(attributeWord);
            if (arrayContains(itemProfileAttributeWords, attributeWord)){
                const indexOfAttributeWord = itemProfileAttributeWords.indexOf(attributeWord);
                const indexOfUniqueWord = uniqueWordArray.indexOf(attributeWord);
                const weight = itemProfileAttributeWeight[indexOfAttributeWord];
                const wordCount = wordCountArray[indexOfUniqueWord];

                console.log("The word "+attributeWord+" is in the query and has a score of "+(weight*wordCount));

                itemScore+=(weight*wordCount);
            }
        });

        console.log("Stored the item "+itemUid+" with a score of "+itemScore+" to the Map");
        relatedItemMap.push([itemUid, itemScore]);
    });

    console.log("Started Sorting the Map");
    //sort the map based on the score for each item in ascending order
    const sortedArray = relatedItemMap.sort(function (a,b) {
        return a[1]<b[1]? 1:a[1]>b[1]?-1:0;
    });

    console.log("Finished Sorting the Map");

    sortedArray.forEach(function (item) {
        relateItemUids.push(item[0]);
    });

    relateItemUids.forEach(function (item) {
        console.log("Recommended Item UID: "+item);
    });

    console.log("Array of related item uids has been sent");
    return {
        itemUids: relateItemUids
    }
});

//return item uids based on the user's item profile
export const getRelatedItems = functions.https.onCall(async (data, context)=>{
    // const searchString:string = data.item_category;
    const searchItemCategory:string = data.item_category;
    const relateItemUids:string[] = [];
    let uniqueWordArray:string[] = [];
    let wordCountArray:number[] = [];
    const relatedItemMap = [];
    const user_uid = data.current_user_uid;

    const userItemProfileQuery = await admin.firestore()
        .doc('User_Item_Profile/'+user_uid+'/user_item_profile/'+searchItemCategory)
        .get();

    if (userItemProfileQuery.exists){
        console.log('User has an existing User Item Profile');

        const userItemProfileDoc = userItemProfileQuery.data();
        uniqueWordArray = userItemProfileDoc['user_item_profile_attributes'];
        wordCountArray = userItemProfileDoc['user_item_profile_count'];

        // uniqueWordArray = userItemProfileAttributes;
        // // for (let i =0; i<userItemProfileAttributes.length; i++){
        // //     uniqueWordArray.push(userItemProfileAttributes[i]);
        // // }
        //
        // console.log('User is here');
        //
        // wordCountArray = userItemProfileCount
        // // for (let i =0; i<userItemProfileCount.length; i++){
        // //     wordCountArray.push(userItemProfileCount[i]);
        // // }
    }

    console.log("Looking for items that belong to the "+searchItemCategory+" category");
    //get items with the same item category
    const querySnapshot = await admin.firestore().collection('Item_Profile')
        .where("item_profile_item_category", "==", searchItemCategory).get();

    const resultDocs = querySnapshot.docs;
    console.log('There are '+resultDocs.length+' in the '+searchItemCategory);
//get items with the same item category

    const readPromise = await resultDocs.forEach(async function (doc) {
        const itemProfile = doc.data();
        const itemUid = itemProfile['item_profile_item_uid'];
        const itemProfileAttributeWords:string[] = itemProfile['item_profile_attribute_words'];
        const itemProfileAttributeWeight:number[] = itemProfile['item_profile_attribute_weights'];
        let itemScore:number = 0;

        uniqueWordArray.forEach(function (attributeWord) {
            console.log(itemProfileAttributeWords);
            console.log(attributeWord);
            if (arrayContains(itemProfileAttributeWords, attributeWord)){
                const indexOfAttributeWord = itemProfileAttributeWords.indexOf(attributeWord);
                const indexOfUniqueWord = uniqueWordArray.indexOf(attributeWord);
                const weight = itemProfileAttributeWeight[indexOfAttributeWord];
                const wordCount = wordCountArray[indexOfUniqueWord];

                console.log("The word "+attributeWord+" is in the query and has a score of "+(weight*wordCount));

                itemScore+=(weight*wordCount);
            }
        });

        console.log("Stored the item "+itemUid+" with a score of "+itemScore+" to the Map");
        relatedItemMap.push([itemUid, itemScore]);
    });

    console.log("Started Sorting the Map");
    //sort the map based on the score for each item in ascending order
    const sortedArray = relatedItemMap.sort(function (a,b) {
        return a[1]<b[1]? 1:a[1]>b[1]?-1:0;
    });

    console.log("Finished Sorting the Map");

    sortedArray.forEach(function (item) {
        relateItemUids.push(item[0]);
    });

    relateItemUids.forEach(function (item) {
        console.log("Recommended Item UID: "+item);
    });

    console.log("Array of related item uids has been sent");
    return {
        itemUids: relateItemUids
    }
});

export const updateUserItemProfile = functions.region('asia-northeast1')
    .firestore
    .document('Cart_Items/cart_items/{eventKey}/{cartItemKey}')
    .onCreate(async (snapshot, context) => {
        const itemDoc = snapshot.data();
        const itemUid = itemDoc['cart_item_item_uid'];
        const user_uid = itemDoc['cart_item_user_uid'];

        try{
            const getItemProfilePromise = await admin.firestore().doc('Item_Profile/'+itemUid).get();
            const itemProfileDoc = getItemProfilePromise.data();
            const itemTags:string[] = itemProfileDoc['item_profile_attribute_words'];
            const itemCategory:string = itemProfileDoc['item_profile_item_category'];

            const getUserItemProfilePromise = await admin.firestore()
                .doc('User_Item_Profile/'+user_uid+'/user_item_profile'+'/'+itemCategory).get()
            const userItemProfileDoc = getUserItemProfilePromise.data();
            const userItemProfileAttribute:string[] = userItemProfileDoc['user_item_profile_attribute'];
            const userItemProfileCount:number[] = userItemProfileDoc['user_item_profile_count'];

            itemTags.forEach(async function (tag) {
                if (arrayContains(userItemProfileAttribute, tag)){
                    const attributeIndex:number = userItemProfileAttribute.indexOf(tag);
                    userItemProfileCount[attributeIndex] = userItemProfileCount[attributeIndex]+1;
                } else {
                    userItemProfileAttribute.push(tag);
                    const attributeIndex:number = userItemProfileAttribute.indexOf(tag);
                    userItemProfileCount[attributeIndex] = 1;
                }
            });

            const updatePromise = await admin.firestore().doc('User_Item_Profile/'+user_uid+'/user_item_profile/'+itemCategory)
                .update({
                    user_item_profile_attribute: userItemProfileAttribute,
                    user_item_profile_count: userItemProfileCount
                });

            console.log('The user: '+user_uid+'item profile for the category of '+itemCategory+' has been updated');

            return updatePromise
        }catch (e) {
            const getItemProfilePromise = await admin.firestore().doc('Item_Profile/'+itemUid).get();
            const itemProfileDoc = getItemProfilePromise.data();
            const itemTags:string[] = itemProfileDoc['item_profile_attribute_words'];
            const itemCategory:string = itemProfileDoc['item_profile_item_category'];
            const userItemProfileAttribute:string[] = [];
            const userItemProfileCount:number[] = [];

            console.log('User item profile is being created');

            itemTags.forEach(async function (tag) {
                if (arrayContains(userItemProfileAttribute, tag)){
                    const attributeIndex:number = userItemProfileAttribute.indexOf(tag);
                    userItemProfileCount[attributeIndex] = userItemProfileCount[attributeIndex]+1;
                } else {
                    userItemProfileAttribute.push(tag);
                    const attributeIndex:number = userItemProfileAttribute.indexOf(tag);
                    userItemProfileCount[attributeIndex] = 1;
                }
            });

            console.log('User item profile is finished');

            const updatePromise = await admin.firestore().doc('User_Item_Profile/'+user_uid+'/user_item_profile/'+itemCategory)
                .set({
                    user_item_profile_attribute: userItemProfileAttribute,
                    user_item_profile_count: userItemProfileCount,
                    user_item_profile_item_category: itemCategory,
                    user_item_profile_user_uid: user_uid
                });

            console.log('The user: '+user_uid+'item profile for the category of '+itemCategory+' has been created');

            return updatePromise
        }

    });

//Events//

export const logNewEvent = functions.region('asia-northeast1').firestore.document('Event/{eventKey}')
    .onCreate(async (snapshot, context) => {
        const event = snapshot.data();
        const eventName:string = event['event_name'];
        const eventCreatorID:string = event['event_creator_id'];
        const eventCategory:string = event['event_category_id'];

        console.log("Event Name: " + eventName);
        console.log("Creator ID: " + eventCreatorID);

        //increase the amount of event in an event category
        const eventCategoryPromise = await admin.firestore()
            .collection('Number_of_Events')
            .doc(eventCategory).get();

        const categoryDoc = eventCategoryPromise.data();
        const increasedCategorySize:number = categoryDoc['number_of_events_in_category'] + 1;
        console.log(eventCategory+"'s size has now been increased to "+increasedCategorySize);

        const increaseCategoryPromise = await admin.firestore()
            .collection('Number_of_Events')
            .doc(eventCategory).update({
                number_of_events_in_category:  increasedCategorySize
            });

        console.log('Updated the amount of events in the '+eventCategory+' Event Category to '+increasedCategorySize);

        const totalPromise = await admin.firestore()
            .collection('Number_of_Events')
            .doc('Total').get();

        const totalDoc = totalPromise.data();
        const increasedTotalSize:number =  totalDoc['number_of_events_in_category']+ 1;
        console.log("Total number of event has now been increased to "+increasedTotalSize
            +' from '+totalDoc['number_of_events_in_category']);

        const increaseTotalPromise = await admin.firestore()
            .collection('Number_of_Events')
            .doc('Total').update({
                number_of_events_in_category: increasedCategorySize
            });

        console.log('Updated the total amount of events to '+ increasedTotalSize);

        return;
    });

export const onEventDelete = functions.region('asia-northeast1').firestore.document('Event/{eventID}')
    .onDelete(async (snapshot, context) => {
        const deletedEvent = snapshot.data();
        const eventName = deletedEvent['event_name'];
        const eventUid = deletedEvent['event_event_uid'];
        const eventCategory = deletedEvent['event_category_id'];

        const cartGroupPromise = await admin.firestore().collection('Cart_Group')
            .where('cart_group_event_uid', '==', snapshot.id).get();

        cartGroupPromise.docs.forEach(async function (cart) {
            await admin.firestore().doc('Cart_Group/'+cart.id).delete();
        });

        ////////////////////////////
        //delete item from TF collection
        const deleteTFPromise = await admin.firestore().doc('TF/event_tf/'+eventCategory+'/'+eventUid).delete();
        console.log('Deleted the event: '+eventUid+' from the Event TF collection');

        //delete item from IDF collection
        const deleteIDFPromise = await admin.firestore().doc('IDF/event_idf/'+eventCategory+'/'+eventUid).delete();
        console.log('Deleted the event: '+eventUid+' from the IDF collection');

        //delete item from Item_Profile collection
        const deleteEventProfilePromise = await admin.firestore().doc('Event_Profile/'+eventUid).delete();
        console.log('Deleted the event: '+eventUid+' from the Event_Profile collection');

        //decrease the amount of items in an item category
        const itemCategoryPromise = await admin.firestore()
            .collection('Number_of_Events')
            .doc(eventCategory).get();

        const decreasedCategorySize:number = itemCategoryPromise.data()['number_of_events_in_category'] - 1;

        const decreaseCategoryPromise = await admin.firestore()
            .collection('Number_of_Events')
            .doc(eventCategory).update({
                number_of_events_in_category: decreasedCategorySize
            });

        console.log('Updated the amount of events in the '+eventCategory+' Event Category to '+decreasedCategorySize);

        //decrease the total amount of items
        const totalPromise = await admin.firestore()
            .collection('Number_of_Events')
            .doc(eventCategory).get();

        const decreasedTotalSize:number = itemCategoryPromise.data()['number_of_events_in_category'] - 1;

        const decreaseTotalPromise = await admin.firestore()
            .collection('Number_of_Events')
            .doc('Total').update({
                number_of_events_in_category: decreasedTotalSize
            });

        console.log('Updated the total amount of items to '+ decreasedTotalSize);
        return
    });

export const cleanTheEventDoc = functions.region('asia-northeast1').firestore.document('Event/{eventID}')
    .onUpdate((change, context) =>{
        const eventBefore = change.before.data();
        const eventAfter = change.after.data();

        if (eventAfter['event_doc'] === eventBefore['event_doc']){
            console.log('This event has no new name, description, or price description');
            return null;
        } else {
            console.log('This item has new data');
            //clean the document string
            const dirtyString:string = eventAfter['event_doc'];
            const badWords:string[] = ["a","an","the","I", "and", "but", "or", "nor", "for",
                "yet", "it", "they", "him", "her", "them", "of"];

            const dirtyStringArray: string[] = dirtyString
                .replace(/[^\w\s]|_/g, function ($1) {
                    return ' ' + $1 + ' ';
                })
                .replace(/[ ]+/g, ' ')
                .split(' ');

            const cleanStringArray: string[] = [];

            console.log('Dirty string array '+dirtyStringArray);

            dirtyStringArray.forEach(function (dirtyWord){
                console.log('Dirty Word'+dirtyWord);
                if (dirtyWord.length>1){
                    if (!arrayContains(badWords, dirtyWord)){
                        cleanStringArray.push(dirtyWord.toLowerCase());
                    }
                }else {
                    if (isNumber(+dirtyWord)){
                        cleanStringArray.push(dirtyWord.toLowerCase());
                    }
                }
            });

            let cleanDoc = '';

            cleanStringArray.forEach(function (cleanWord) {
                cleanDoc = cleanDoc.concat(' ',cleanWord);
            });

            cleanDoc = cleanDoc.trimLeft();
            cleanDoc = cleanDoc.trimRight();

            return admin.firestore().collection('Event').doc(eventAfter['event_event_uid']).update({
                event_doc:cleanDoc
            })
        }
    });

export const onEventDocUpdate = functions
    .firestore
    .document('Event/{eventId}').onUpdate((change, context) =>{
        const eventBefore = change.before.data();
        const eventAfter = change.after.data();

        console.log("After: "+ eventAfter['event_name']+", Before: "+ eventBefore['event_name']);
        console.log("After: "+ eventAfter['event_description']+", Before: "+ eventBefore['event_description']);
        console.log("After: "+ eventAfter['event_tags']+", Before: "+ eventBefore['event_tags']);

        if (eventAfter['event_name'] === eventBefore['event_name']
            && eventAfter['event_description'] === eventBefore['event_description']
            && eventAfter['event_tags'] === eventBefore['event_tags']
            && eventAfter['event_event_uid'] === eventBefore['event_event_uid']){

            console.log("Event has no new data");

            return null;
        }else {
            console.log("Event has updated data");

            const eventName:string = eventAfter['event_name'];
            const eventDescription: string = eventAfter['event_description'];
            const eventTags: string = eventAfter['event_tags'];
            const eventDoc: string = eventName.concat(" ", eventDescription," ",eventTags).toLowerCase();

            return admin.firestore().collection('Event').doc(eventAfter['event_event_uid']).update({event_doc: eventDoc});
        }
    });

export const createCartGroupUpdateCreateEvent = functions
    .firestore
    .document('Event/{eventId}').onUpdate(async (change, context) =>{
        const eventBefore = change.before.data();
        const eventAfter = change.after.data();

        console.log("After: "+ eventAfter['event_name']+", Before: "+ eventBefore['event_name']);
        console.log("After: "+ eventAfter['event_description']+", Before: "+ eventBefore['event_description']);
        console.log("After: "+ eventAfter['event_tags']+", Before: "+ eventBefore['event_tags']);

        if (eventAfter['event_event_uid'] === eventBefore['event_event_uid']){

            console.log("Event has no new data");

            return null;
        }else {
            console.log("Event has updated data");

            const eventUid = eventAfter['event_event_uid'];

            console.log('Now Creating the Cart Group with the Event ID of '+eventUid);

            const cartGroupPromise =  await admin.firestore().collection('Cart_Group').add({
                cart_group_event_uid: eventUid,
                cart_group_uid: ''
            });

            console.log('Now Updating the Cart Group: '+cartGroupPromise.id+ ' with the Event ID of '+eventUid);

            await admin.firestore().doc('Cart_Group/'+cartGroupPromise.id).update({
                cart_group_uid: cartGroupPromise.id
            });

            await admin.firestore().doc('Event/'+eventUid).update({
                event_cart_group_uid: cartGroupPromise.id
            });


        }
    });

export const updateEventTF = functions.region('asia-northeast1').firestore.document('Event/{eventID}')
    .onUpdate(async (change, context) =>{
        const eventBefore = change.before.data();
        const eventAfter = change.after.data();

        if (eventAfter['event_doc'] === eventBefore['event_doc']){

            console.log("Event has no new data, no need to update tfidf");

            return null;
        }else {
            console.log("Event has updated data");
            const eventDoc:string = eventAfter['event_doc'];
            let uniqueWordCount:number = 0;
            let totalWordCount:number;
            const uniqueWordArray:string[] = [];
            const wordCountArray:number[] = [];

            const cleanWordArray = eventDoc.split(' ');
            totalWordCount = cleanWordArray.length;

            cleanWordArray.forEach(function (cleanWord) {
                if (!arrayContains(uniqueWordArray, cleanWord)){
                    uniqueWordArray.push(cleanWord);
                    uniqueWordCount++;
                    wordCountArray.push(1);
                }else {
                    const uniqueWordIndex = uniqueWordArray.indexOf(cleanWord);
                    wordCountArray[uniqueWordIndex] = wordCountArray[uniqueWordIndex]+1;
                }
            });

            const tfArray:number[] = [];

            for(let i =0; i<wordCountArray.length; i++){
                tfArray[i] = (wordCountArray[i])/totalWordCount;
            }

            try{
                await admin.firestore().collection('TF').doc('event_tf').collection(eventAfter['event_category_id'])
                    .doc(eventAfter['event_event_uid'])
                    .update({
                        tf_unique_word_count: uniqueWordCount,
                        tf_total_word_count: totalWordCount,
                        tf_unique_words: uniqueWordArray,
                        tf_unique_words_count: wordCountArray,
                        tf_event_uid: eventAfter['event_event_uid'],
                        tf_tf_score: tfArray
                    });

                console.log("Updated the tf value of the event: "+
                    eventAfter['event_event_uid']
                    +"which belongs to the "+eventAfter['event_category_id']+" Category");

            }catch (e) {
                await admin.firestore().collection('TF').doc('event_tf').collection(eventAfter['event_category_id'])
                    .doc(eventAfter['event_event_uid'])
                    .set({
                        tf_unique_word_count: uniqueWordCount,
                        tf_total_word_count: totalWordCount,
                        tf_unique_words: uniqueWordArray,
                        tf_unique_words_count: wordCountArray,
                        tf_event_uid: eventAfter['event_event_uid'],
                        tf_tf_score: []
                    });

                await admin.firestore().collection('TF').doc('event_tf').collection(eventAfter['event_category_id'])
                    .doc(eventAfter['event_event_uid'])
                    .update({
                        tf_unique_word_count: uniqueWordCount,
                        tf_total_word_count: totalWordCount,
                        tf_unique_words: uniqueWordArray,
                        tf_unique_words_count: wordCountArray,
                        tf_event_uid: eventAfter['event_event_uid'],
                        tf_tf_score: tfArray
                    });

                console.log("Wrote and Updated the tf value of the item: "+
                    eventAfter['item_uid']
                    +"which belongs to the "+eventAfter['event_category_id']+" Category");
            }

            return
        }
    });

async function getNumberOfItemsInEventCategory(eventCategory: string): Promise<number>{
    const snapshot = await admin.firestore().collection('Number_of_Events')
        .doc(eventCategory)
        .get();
    const data = snapshot.data();
    const numberOfItems:number = data['number_of_events_in_category'];

    console.log("Method: Number of Items in the category: "+eventCategory+" is "+numberOfItems);

    return numberOfItems;
}

async function getEventsThatContainAWord(word: string, eventCategory: string): Promise<string[]>{
    const eventIDArray:string[] = [];

    const snapshot = await admin.firestore().collection('TF')
        .doc('event_tf').collection(eventCategory).
        where("tf_unique_words", "array-contains", word).get();

    const docs = snapshot.docs;

    docs.forEach(function (document) {
        eventIDArray.push(document.data()['tf_item_uid'])
    });

    console.log("Method: Number of Events that the word: "+word+" exist is "+eventIDArray.length);

    return eventIDArray;
}

async function getEventIDFWeightArray(tfWords: string[], eventCategory: string):Promise<number[]> {
    const promiseArray: number[] = [];
    const numberOfItems = await getNumberOfItemsInEventCategory(eventCategory);
    console.log("Number of Events in the category: "+eventCategory+" is " + numberOfItems);

    for(const tfword in tfWords){
        const resultItemArray = await getEventsThatContainAWord(tfWords[Number(tfword)], eventCategory);
        console.log("Number of Events that the word: " + tfWords[Number(tfword)] + " exist is " + resultItemArray.length);

        const result: number = Math.log10(numberOfItems/resultItemArray.length)+1;

        promiseArray.push(result);
        console.log("In Loop: Promise Array Value: " + promiseArray);
    }

    console.log("Outside Loop: Promise Array Value: " + promiseArray);
    return promiseArray;
}

async function writeToEventIDFCollection(tfEventUid: string, eventCategory: string,tfWords: string[], weightArray: number[]) {
    const writePromise =  admin.firestore()
        .collection('IDF')
        .doc('event_idf')
        .collection(eventCategory)
        .doc(tfEventUid).set({
            idf_event_uid: tfEventUid,
            idf_words: tfWords,
            idf_weight: weightArray
        });
    console.log("The IDF for the event "+tfEventUid+" has been updated");

    return writePromise;
}

async function writeToEventProfileCollection(tfEventUid: string, eventCategory: string,tfWords: string[], tfidfArray: number[]) {
    const writePromise = await admin.firestore().collection('Event_Profile')
        .doc(tfEventUid)
        .set({
            event_profile_event_uid: tfEventUid,
            event_profile_event_category: eventCategory,
            event_profile_attribute_words: tfWords,
            event_profile_attribute_weights: tfidfArray
        });
    console.log("The Event_Profile for the event "+tfEventUid+" has been updated");

    return writePromise;
}

export const updateWeddingIDF = functions.firestore.document("TF/event_tf/Wedding/{eventID}")
    .onUpdate(async (change, context) => {
        const eventBefore = change.before.data();
        const eventAfter = change.after.data();

        if (eventAfter['tf_tf_score'] === eventBefore['tf_tf_score']){
            console.log('This TF score of the words in this event has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this event has changed');
            console.log('System is gonna update all idf for all events in the Wedding Category');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('event_tf').collection('Wedding').get();

            const eventDocs = querySnapshot.docs;

            await eventDocs.forEach(async function (eventDoc) {
                const doc = eventDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfEventUid:string = doc['tf_event_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the event: "+tfEventUid);
                const weightArray:number[] = await getEventIDFWeightArray(tfWords, 'Wedding');

                const idfWritePromise = await writeToEventIDFCollection(tfEventUid, 'Wedding',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToEventProfileCollection(tfEventUid, 'Wedding',tfWords, tfidfArray);
            });

            console.log("The Entire Wedding IDF has been updated");
            return null;
        }
    });

export const updatePartyIDF = functions.firestore.document("TF/event_tf/Party/{eventID}")
    .onUpdate(async (change, context) => {
        const eventBefore = change.before.data();
        const eventAfter = change.after.data();

        if (eventAfter['tf_tf_score'] === eventBefore['tf_tf_score']){
            console.log('This TF score of the words in this event has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this event has changed');
            console.log('System is gonna update all idf for all events in the Party Category');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('event_tf').collection('Party').get();

            const eventDocs = querySnapshot.docs;

            await eventDocs.forEach(async function (eventDoc) {
                const doc = eventDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfEventUid:string = doc['tf_event_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the event: "+tfEventUid);
                const weightArray:number[] = await getEventIDFWeightArray(tfWords, 'Party');

                const idfWritePromise = await writeToEventIDFCollection(tfEventUid, 'Party',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToEventProfileCollection(tfEventUid, 'Party',tfWords, tfidfArray);
            });

            console.log("The Entire Party IDF has been updated");
            return null;
        }
    });

export const updateBusinessEventsIDF = functions.firestore.document("TF/event_tf/Business_Events/{eventID}")
    .onUpdate(async (change, context) => {
        const eventBefore = change.before.data();
        const eventAfter = change.after.data();

        if (eventAfter['tf_tf_score'] === eventBefore['tf_tf_score']){
            console.log('This TF score of the words in this event has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this event has changed');
            console.log('System is gonna update all idf for all events in the Business_Events Category');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('event_tf').collection('Business_Events').get();

            const eventDocs = querySnapshot.docs;

            await eventDocs.forEach(async function (eventDoc) {
                const doc = eventDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfEventUid:string = doc['tf_event_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the event: "+tfEventUid);
                const weightArray:number[] = await getEventIDFWeightArray(tfWords, 'Business_Events');

                const idfWritePromise = await writeToEventIDFCollection(tfEventUid, 'Business_Events',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToEventProfileCollection(tfEventUid, 'Business_Events',tfWords, tfidfArray);
            });

            console.log("The Entire Business_Events IDF has been updated");
            return null;
        }
    });

export const updateSportsEventsIDF = functions.firestore.document("TF/event_tf/Sports_Events/{eventID}")
    .onUpdate(async (change, context) => {
        const eventBefore = change.before.data();
        const eventAfter = change.after.data();

        if (eventAfter['tf_tf_score'] === eventBefore['tf_tf_score']){
            console.log('This TF score of the words in this event has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this event has changed');
            console.log('System is gonna update all idf for all events in the Sports_Events Category');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('event_tf').collection('Sports_Events').get();

            const eventDocs = querySnapshot.docs;

            await eventDocs.forEach(async function (eventDoc) {
                const doc = eventDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfEventUid:string = doc['tf_event_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the event: "+tfEventUid);
                const weightArray:number[] = await getEventIDFWeightArray(tfWords, 'Sports_Events');

                const idfWritePromise = await writeToEventIDFCollection(tfEventUid, 'Sports_Events',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToEventProfileCollection(tfEventUid, 'Sports_Events',tfWords, tfidfArray);
            });

            console.log("The Entire Sports_Events IDF has been updated");
            return null;
        }
    });

export const updateCustomizedEventsIDF = functions.firestore.document("TF/event_tf/Customized_Events/{eventID}")
    .onUpdate(async (change, context) => {
        const eventBefore = change.before.data();
        const eventAfter = change.after.data();

        if (eventAfter['tf_tf_score'] === eventBefore['tf_tf_score']){
            console.log('This TF score of the words in this event has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this event has changed');
            console.log('System is gonna update all idf for all events in the Customized_Events Category');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('event_tf').collection('Customized_Events').get();

            const eventDocs = querySnapshot.docs;

            await eventDocs.forEach(async function (eventDoc) {
                const doc = eventDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfEventUid:string = doc['tf_event_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray:number[] = [];

                console.log("We are updating the event: "+tfEventUid);
                const weightArray:number[] = await getEventIDFWeightArray(tfWords, 'Customized_Events');

                const idfWritePromise = await writeToEventIDFCollection(tfEventUid, 'Customized_Events',tfWords, weightArray);

                //calculate TFIDF
                for(let i = 0; i<tfWords.length; i++){
                    tfidfArray.push(tfScoreArray[i]*weightArray[i]);
                }

                //Write profile of item
                return writeToEventProfileCollection(tfEventUid, 'Customized_Events',tfWords, tfidfArray);
            });

            console.log("The Entire Customized_Events IDF has been updated");
            return null;
        }
    });

export const updateUserEventProfileOnCreateEvent = functions.firestore.document("Event_Profile/{eventID}")
    .onCreate(async (snapshot, context) => {
        const eventProfile = snapshot.data();
        const eventProfileEventUid: string = eventProfile['event_profile_event_uid'];
        const eventCategoryId: string = eventProfile['event_profile_event_category'];
        const eventProfileAttributes: string[] = eventProfile['event_profile_attribute_words'];

        const eventReadPromise = await admin.firestore().doc("Event/"+eventProfileEventUid).get();
        const event = eventReadPromise.data();
        const eventCreatorUid: string = event['event_creator_id'];

        try {
            //if user has existing event profile
            const userEventProfilePromise = await admin.firestore().doc('User_Event_Profile/' + eventCreatorUid + '/user_event_profile/' + eventCategoryId).get();
            const userEventProfile: FirebaseFirestore.DocumentData = userEventProfilePromise.data();
            const userEventProfileAttributes: string[] = userEventProfile['user_event_profile_attribute'];
            const userEventProfileCount: number[] = userEventProfile['user_event_profile_count'];

            eventProfileAttributes.forEach(function (attribute) {
                if (arrayContains(userEventProfileAttributes, attribute)) {
                    const index = userEventProfileAttributes.indexOf(attribute);
                    userEventProfileCount[index] += 1;
                } else {
                    userEventProfileAttributes.push(attribute);
                    userEventProfileCount.push(1);
                }
            });

            return admin.firestore().doc('User_Event_Profile/' + eventCreatorUid + '/user_event_profile/' + eventCategoryId).update({
                user_event_profile_attribute: userEventProfileAttributes,
                user_event_profile_count: userEventProfileCount
            })

        } catch (e) {
            //if user doesn't have a user event profile
            const userEventProfileCount: number[] = [];

            eventProfileAttributes.forEach(function (attribute) {
                userEventProfileCount.push(1);
            });

            return admin.firestore().doc('User_Event_Profile/' + eventCreatorUid + '/user_event_profile/' + eventCategoryId).set({
                user_event_profile_attribute: eventProfileAttributes,
                user_event_profile_count: userEventProfileCount,
                user_event_profile_event_category: eventCategoryId,
                user_event_profile_user_uid: eventCreatorUid
            })
        }
    });

export const updateUserEventProfileOnAttendEvent = functions.firestore.document("Attended_Events/{userUid}/{eventCategory}/{eventID}")
    .onCreate(async (snapshot, context) => {
        const attendedEvent:FirebaseFirestore.DocumentData = snapshot.data();
        const attendedEventEventUid:string = attendedEvent['attended_event_event_uid'];
        const attendedEventEventCategory: string = attendedEvent['attended_event_event_category_id'];
        const attendedEventAttendingUserUid: string = attendedEvent['attended_event_user_uid'];

        const eventProfilePromise = await admin.firestore().doc('Event_Profile/'+attendedEventEventUid).get();
        const eventProfile:FirebaseFirestore.DocumentData = eventProfilePromise.data();
        const eventProfileAttributes:string[] = eventProfile['event_profile_attribute_words'];

        try {
            //if user has existing event profile
            const userEventProfilePromise = await admin.firestore().doc('User_Event_Profile/'+attendedEventAttendingUserUid+
                '/user_event_profile/'+attendedEventEventCategory).get();
            const userEventProfile: FirebaseFirestore.DocumentData = userEventProfilePromise.data();
            const userEventProfileAttributes: string[] = userEventProfile['user_event_profile_attribute'];
            const userEventProfileCount: number[] = userEventProfile['user_event_profile_count'];

            eventProfileAttributes.forEach(function (attribute) {
                if (arrayContains(userEventProfileAttributes, attribute)){
                    const index = userEventProfileAttributes.indexOf(attribute);
                    userEventProfileCount[index]+=1;
                }else {
                    userEventProfileAttributes.push(attribute);
                    userEventProfileCount.push(1);
                }
            });

            return admin.firestore().doc('User_Event_Profile/'+attendedEventAttendingUserUid+'/user_event_profile/'+attendedEventEventCategory).update({
                user_event_profile_attribute: userEventProfileAttributes,
                user_event_profile_count: userEventProfileCount
            })

        }catch (e) {
            //if user doesn't have a user event profile
            const userEventProfileCount: number[] = [];

            eventProfileAttributes.forEach(function (attribute) {
                userEventProfileCount.push(1);
            });

            return admin.firestore().doc('User_Event_Profile/'+attendedEventAttendingUserUid+'/user_event_profile/'+attendedEventEventCategory).set({
                user_event_profile_attribute: eventProfileAttributes,
                user_event_profile_count: userEventProfileCount,
                user_event_profile_event_category: attendedEventEventCategory,
                user_event_profile_user_uid: attendedEventEventUid
            })
        }
    });

export const updateUserEventProfileOnSponsorEvent = functions.firestore.document("Sponsored_Events/{userUid}/{eventCategory}/{eventID}")
    .onCreate(async (snapshot, context) => {
        //
        const sponsoredEvent:FirebaseFirestore.DocumentData = snapshot.data();
        const sponsoredEventEventUid:string = sponsoredEvent['sponsored_event_event_uid'];
        const sponsoredEventEventCategory: string = sponsoredEvent['sponsored_event_event_category_id'];
        const sponsoredEventSponsoringUserUid: string = sponsoredEvent['sponsored_event_user_uid'];

        const eventProfilePromise = await admin.firestore().doc('Event_Profile/'+sponsoredEventEventUid).get();
        const eventProfile = eventProfilePromise.data();

        console.log("Sponsored Event UID is "+sponsoredEventEventUid);

        const eventProfileAttributes:string[] = eventProfile['event_profile_attribute_words'];

        try {
            //if user has existing event profile
            const userEventProfilePromise = await admin.firestore().doc('User_Event_Profile/'+sponsoredEventSponsoringUserUid+
                '/user_event_profile/'+sponsoredEventEventCategory).get();
            const userEventProfile: FirebaseFirestore.DocumentData = userEventProfilePromise.data();
            const userEventProfileAttributes: string[] = userEventProfile['user_event_profile_attribute'];
            const userEventProfileCount: number[] = userEventProfile['user_event_profile_count'];

            eventProfileAttributes.forEach(function (attribute) {
                if (arrayContains(userEventProfileAttributes, attribute)){
                    const index = userEventProfileAttributes.indexOf(attribute);
                    userEventProfileCount[index]+=1;
                }else {
                    userEventProfileAttributes.push(attribute);
                    userEventProfileCount.push(1);
                }
            });

            return admin.firestore().doc('User_Event_Profile/'+sponsoredEventSponsoringUserUid+'/user_event_profile/'+sponsoredEventEventCategory).update({
                user_event_profile_attribute: userEventProfileAttributes,
                user_event_profile_count: userEventProfileCount
            })

        }catch (e) {
            //if user doesn't have a user event profile
            const userEventProfileCount: number[] = [];

            eventProfileAttributes.forEach(function (attribute) {
                userEventProfileCount.push(1);
            });

            return admin.firestore().doc('User_Event_Profile/'+sponsoredEventSponsoringUserUid+'/user_event_profile/'+sponsoredEventEventCategory).set({
                user_event_profile_attribute: eventProfileAttributes,
                user_event_profile_count: userEventProfileCount,
                user_event_profile_event_category: sponsoredEventEventCategory,
                user_event_profile_user_uid: sponsoredEventEventUid
            })
        }
    });

export const updateAttendeesListOnAttendEvent = functions.firestore.document("Attended_Events/{userUid}/{eventCategory}/{eventID}")
    .onCreate(async (snapshot, context) => {
        const attendedEvent:FirebaseFirestore.DocumentData = snapshot.data();
        const attendedEventEventUid:string = attendedEvent['attended_event_event_uid'];
        const attendedEventEventCategory: string = attendedEvent['attended_event_event_category_id'];
        const attendedEventAttendingUserUid: string = attendedEvent['attended_event_user_uid'];

        try {
            //if an attendees list for the event is already created
            const attendeesListPromise = await admin.firestore().doc('Attendees_List/' + attendedEventEventUid).get();
            const attendeesList: FirebaseFirestore.DocumentData = attendeesListPromise.data();
            const attendeesListUsers: string[] = attendeesList['attendees_list_user_uid_list'];

            attendeesListUsers.push(attendedEventAttendingUserUid);
            const attendeesListNumberOfUsers = attendeesListUsers.length;

            return admin.firestore().doc('Attendees_List/' + attendedEventEventUid).update({
                attendees_list_list_size: attendeesListNumberOfUsers,
                attendees_list_user_uid_list: attendeesListUsers
            })
        }catch (e) {
            return admin.firestore().doc('Attendees_List/' + attendedEventEventCategory).set({
                attendees_list_list_size: 1,
                attendees_list_user_uid_list: [attendedEventAttendingUserUid],
                attendees_list_event_uid: attendedEventEventUid,
                attendees_list_event_category: attendedEventEventCategory
            })
        }
    });

export const updateAttendeesListOnCreateEvent = functions.firestore.document("Event/{eventID}")
    .onUpdate(async (change, context) => {
        const eventBefore = change.before.data();
        const eventAfter = change.after.data();
        
        if (eventBefore['event_event_uid']===eventAfter['event_event_uid']){
            return null
        } else {
            const event = eventAfter;
            const eventUid: string = event['event_event_uid'];
            const eventCategory: string = event['event_category_id'];
            const eventCreatorUid: string = event['event_creator_id'];

            return admin.firestore().doc('Attendees_List/' + eventUid).set({
                attendees_list_list_size: 1,
                attendees_list_user_uid_list: [eventCreatorUid],
                attendees_list_event_uid: eventUid,
                attendees_list_event_category: eventCategory
            })
        }
    });

export const updateSponsorsListOnSponsorEvent = functions.firestore.document("Sponsored_Events/{userUid}/{eventCategory}/{eventID}")
    .onCreate(async (snapshot, context) => {
        const sponsoredEvent:FirebaseFirestore.DocumentData = snapshot.data();
        const sponsoredEventEventUid:string = sponsoredEvent['sponsored_event_event_uid'];
        const sponsoredEventEventCategory: string = sponsoredEvent['sponsored_event_event_category_id'];
        const sponsoredEventAttendingUserUid: string = sponsoredEvent['sponsored_event_user_uid'];

        try {
            const sponsorsListPromise = await admin.firestore().doc('Sponsors_List/'+sponsoredEventEventUid).get();
            const sponsorsList: FirebaseFirestore.DocumentData = sponsorsListPromise.data();
            const sponsorsListUsers:string[] = sponsorsList['sponsors_list_user_uid_list'];

            sponsorsListUsers.push(sponsoredEventAttendingUserUid);
            const sponsorsListNumberOfUsers:number = sponsorsListUsers.length;

            return admin.firestore().doc('Sponsors_List/'+sponsoredEventEventUid).update({
                sponsors_list_list_size: sponsorsListNumberOfUsers,
                sponsors_list_user_uid_list: sponsorsListUsers
            })
        }catch (e) {
            return admin.firestore().doc('Attendees_List/' + sponsoredEventEventCategory).set({
                attendees_list_list_size: 1,
                attendees_list_user_uid_list: [sponsoredEventAttendingUserUid],
                attendees_list_event_uid: sponsoredEventEventUid,
                attendees_list_event_category: sponsoredEventEventCategory
            })
        }
    });

export const updateSponsorsListOnCreateEvent = functions.firestore.document("Event/{eventID}")
    .onUpdate(async (change, context) => {
        const eventBefore = change.before.data();
        const eventAfter = change.after.data();

        if (eventBefore['event_event_uid']===eventAfter['event_event_uid']){
            return null
        } else {
            const event: FirebaseFirestore.DocumentData = eventAfter;
            const eventUid: string = event['event_event_uid'];
            const eventCategory: string = event['event_category_id'];
            const eventCreatorUid: string = event['event_creator_id'];

            return admin.firestore().doc('Sponsors_List/' + eventUid).set({
                sponsors_list_list_size: 1,
                sponsors_list_user_uid_list: [eventCreatorUid],
                sponsors_list_event_uid: eventUid,
                sponsors_list_event_category: eventCategory
            })
        }
    });