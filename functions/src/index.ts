import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {strictEqual} from "assert";
import {Console} from "inspector";
import enableLogging = admin.database.enableLogging;
import {event} from "firebase-functions/lib/providers/analytics";

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
.onCreate(async (documentSnapshot, context) =>{
    const store = documentSnapshot.data();
    const storeUid = documentSnapshot.id;
    const storeName:string = store['store_store_name'];
    const storeOwnerUid:string = store['store_owner_id'];
    const storeLocation:string = store['store_location'];

    const storeNameKeywords: string[] = storeName.split(" ");
    const storeLocationKeywords:string[] = storeLocation.split(" ");

    console.log("Store Name: "+storeName);
    console.log("Store Owner ID: "+storeOwnerUid);

    return admin.firestore().doc("Store/"+storeUid).update({
        store_uid: storeUid,
        store_location_keywords: storeLocationKeywords,
        store_name_keywords: storeNameKeywords
    })
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

    //add item_average_rating
    await admin.firestore().doc("Items/"+itemUid).update({
        item_average_rating: 0
    });

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

export const updateChurchIDFOnItemDelete = functions.firestore.document("TF/tf/Church/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Church').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Church');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Church').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Church');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Church', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Church', tfWords, tfidfArray);
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

export const updateDJIDFOnItemDelete = functions.firestore.document("TF/tf/DJ/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/DJ').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the DJ');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('DJ').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'DJ');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'DJ', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'DJ', tfWords, tfidfArray);
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

export const updateEventCoordinatorIDFOnItemDelete = functions.firestore.document("TF/tf/Event_Coordinator/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Event_Coordinator').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Event_Coordinator');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Event_Coordinator').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Event_Coordinator');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Event_Coordinator', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Event_Coordinator', tfWords, tfidfArray);
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

export const updateEventEntertainerIDFOnItemDelete = functions.firestore.document("TF/tf/Event_Entertainer/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Event_Entertainer').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Event_Entertainer');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Event_Entertainer').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Event_Entertainer');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Event_Entertainer', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Event_Entertainer', tfWords, tfidfArray);
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

export const updateEventStylistIDFOnItemDelete = functions.firestore.document("TF/tf/Event_Stylist/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Event_Stylist').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Event_Stylist');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Event_Stylist').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Event_Stylist');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Event_Stylist', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Event_Stylist', tfWords, tfidfArray);
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

export const updateFlowersIDFOnItemDelete = functions.firestore.document("TF/tf/Flowers/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Flowers').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Flowers');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Flowers').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Flowers');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Flowers', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Flowers', tfWords, tfidfArray);
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

export const updateFoodIDFOnItemDelete = functions.firestore.document("TF/tf/Food/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Flowers').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Food');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Food').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Food');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Food', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Food', tfWords, tfidfArray);
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

export const updateHair_and_Make_upIDFOnItemDelete = functions.firestore.document("TF/tf/Hair_and_Make_up/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Hair_and_Make_up').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Hair_and_Make_up');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Hair_and_Make_up').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Hair_and_Make_up');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Hair_and_Make_up', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Hair_and_Make_up', tfWords, tfidfArray);
            });

            console.log("The Entire Hair_and_Make_up IDF has been updated");
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

export const updateHostIDFOnItemDelete = functions.firestore.document("TF/tf/Host/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Host').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Host');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Host').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Host');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Host', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Host', tfWords, tfidfArray);
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

export const updateJewelryIDFOnItemDelete = functions.firestore.document("TF/tf/Jewelry/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Jewelry').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Jewelry');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Jewelry').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Jewelry');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Jewelry', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Jewelry', tfWords, tfidfArray);
            });

            console.log("The Jewelry Host IDF has been updated");
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

export const updateLightsIDFOnItemDelete = functions.firestore.document("TF/tf/Lights/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Lights').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Lights');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Lights').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Lights');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Lights', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Lights', tfWords, tfidfArray);
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

export const updatePhotographyIDFOnItemDelete = functions.firestore.document("TF/tf/Photography/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Photography').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Photography');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Photography').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Photography');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Photography', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Photography', tfWords, tfidfArray);
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

export const updatePrintedMaterialsIDFOnItemDelete = functions.firestore.document("TF/tf/Printed_Materials/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Printed_Materials').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Printed_Materials');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Printed_Materials').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Printed_Materials');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Printed_Materials', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Printed_Materials', tfWords, tfidfArray);
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

export const updateSoundsIDFOnItemDelete = functions.firestore.document("TF/tf/Sounds/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Sounds').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Sounds');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Sounds').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Sounds');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Sounds', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Sounds', tfWords, tfidfArray);
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

export const updateSuitsIDFOnItemDelete = functions.firestore.document("TF/tf/Suits/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Suits').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Suits');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Suits').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Suits');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Suits', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Suits', tfWords, tfidfArray);
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

export const updateVenueIDFOnItemDelete = functions.firestore.document("TF/tf/Venue/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Venue').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Venue');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Venue').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Venue');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Venue', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Venue', tfWords, tfidfArray);
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

export const updateVideographyIDFOnItemDelete = functions.firestore.document("TF/tf/Videography/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Videography').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Videography');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Videography').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Videography');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Videography', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Videography', tfWords, tfidfArray);
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

export const updateWeddingVehicleIDFOnItemDelete = functions.firestore.document("TF/tf/Wedding_Vehicle/{itemCategory}")
    .onDelete(async (snapshot, context) => {
        const numberOfItemsInCategoryPromise = await admin.firestore().collection('TF/tf/Wedding_Vehicle').get();
        const numberOfItemsInCategory = numberOfItemsInCategoryPromise.size;

        if (numberOfItemsInCategory === 0){
            return null
        } else {
            console.log('This TF score of the words in this item has changed');
            console.log('System is gonna update all idf for all items in the Wedding_Vehicle');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Wedding_Vehicle').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfItemUid: string = doc['tf_item_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the item: " + tfItemUid);
                const weightArray: number[] = await getIDFWeightArray(tfWords, 'Wedding_Vehicle');

                const idfWritePromise = await writeToIDFCollection(tfItemUid, 'Wedding_Vehicle', tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToItemProfileCollection(tfItemUid, 'Wedding_Vehicle', tfWords, tfidfArray);
            });

            console.log("The Entire Wedding_Vehicle IDF has been updated");
            return null;
        }
    });

function getCleanString(dirtyString: string): string {
    let clean_string:string = '';

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

    cleanStringArray.forEach(function (cleanWord) {
        clean_string = clean_string.concat(' ',cleanWord);
    });

    clean_string = clean_string.trimLeft();
    clean_string = clean_string.trimRight();

    return clean_string;
}

function getNumberOfWordsArray(wordArray: string[]): number[] {
    const uniqueWordArray:string[] = [];
    const wordCountArray:number[] = [];

    wordArray.forEach(function (cleanWord) {
        if (!arrayContains(uniqueWordArray, cleanWord)){
            uniqueWordArray.push(cleanWord);
            wordCountArray.push(1);
        }else {
            const uniqueWordIndex = uniqueWordArray.indexOf(cleanWord);
            wordCountArray[uniqueWordIndex] = wordCountArray[uniqueWordIndex]+1;
        }
    });

    return wordCountArray;
}

function getUniqueWordArray(wordArray: string[]): string[] {
    const numberOfWords:number[] = [];
    const uniqueWordArray:string[] = [];

    wordArray.forEach(function (cleanWord) {
        if (!arrayContains(uniqueWordArray, cleanWord)){
            uniqueWordArray.push(cleanWord);
        }
    });

    return uniqueWordArray;
}

export const searchForItem = functions.https.onCall(async (data, context)=>{
    // const searchString:string = data.item_category;
    const itemCategory:string = data.item_category;
    const itemQuery:string[] = getCleanString(data.query).split(' ');
    const uniqueWordArray:string[] = getUniqueWordArray(itemQuery);
    const uniqueWordCount:number[] = [];
    const holderArray: string[] = [];

    itemQuery.forEach(function (cleanWord) {
        if (!arrayContains(holderArray, cleanWord)){
            holderArray.push(cleanWord);
            uniqueWordCount.push(1);
        }else {
            const uniqueWordIndex:number = holderArray.indexOf(cleanWord);
            uniqueWordCount[uniqueWordIndex] = uniqueWordCount[uniqueWordIndex]+1;
        }

        const Index:number = uniqueWordArray.indexOf(cleanWord);
        console.log("Unique word: "+holderArray[Index]+", the number of times it repeated "+ uniqueWordCount[Index]);
    });

    const itemProfileCollectionRead = await admin.firestore().collection("Item_Profile").where("item_profile_item_category", "==", itemCategory).get();
    const relatedItemUids: string[] = [];
    const retaledItemsMap: any[] = [];
    const itemProfileCollection = itemProfileCollectionRead.docs;

    itemProfileCollection.forEach(await function (itemProfile) {
        const itemProfileItemUid:string = itemProfile.data()['item_profile_item_uid'];
        const itemProfileAttributes: string[] = itemProfile.data()['item_profile_attribute_words'];
        const itemProfileWeights: number[] = itemProfile.data()['item_profile_attribute_weights'];
        let itemScore:number = 0;

        uniqueWordArray.forEach(function (uniqueWord) {
            if (arrayContains(itemProfileAttributes, uniqueWord)) {
                console.log('The item: '+ itemProfileItemUid+' contains the word '+ uniqueWord);

                const itemWeightIndex = itemProfileAttributes.indexOf(uniqueWord);
                const userItemAttributeIndex = uniqueWordArray.indexOf(uniqueWord);
                const numberOfWords = uniqueWordCount[userItemAttributeIndex];
                const attributeWeight = itemProfileWeights[itemWeightIndex];

                console.log("The value of the number of times the word "+ uniqueWord +" is repeated in the query is "+ numberOfWords);
                console.log("The value of the attribute weight the word "+ uniqueWord +" in the item "+ itemProfileItemUid+" is "+ attributeWeight);
                itemScore +=  numberOfWords * attributeWeight;
            }
        });

        console.log('The item: '+ itemProfileItemUid+' has a score of '+ itemScore);
        retaledItemsMap.push([itemProfileItemUid, itemScore]);
    });

    console.log("Started Sorting the Map");
    //sort the map based on the score for each item in ascending order
    const sortedArray = retaledItemsMap.sort(function (a,b) {
        return a[1]<b[1]? 1:a[1]>b[1]?-1:0;
    });

    console.log("Finished Sorting the Map");

    sortedArray.forEach(function (item) {
        relatedItemUids.push(item[0]);
    });

    relatedItemUids.forEach(function (item) {
        console.log("Recommended Item UID: "+item);
    });

    console.log("Array of related item uids has been sent");
    return {
        itemUids: relatedItemUids
    }
});

//return item uids based on the user's item profile
export const getRelatedItems = functions.https.onCall(async (data, context)=>{
    // const searchString:string = data.item_category;
    const itemCategory:string = data.item_category;
    const user_uid = data.current_user_uid;

    try {
        const userItemProfileReadPromise = await admin.firestore().doc("User_Item_Profile/"+user_uid+"/user_item_profile/"+itemCategory).get();
        const userItemProfile = userItemProfileReadPromise.data();
        const userItemProfileAttributes:string[] = userItemProfile['user_item_profile_attribute'];
        const userItemProfileCount:number[] = userItemProfile['user_item_profile_count'];
        const itemProfileCollectionRead = await admin.firestore().collection("Item_Profile").where("item_profile_item_category", "==", itemCategory).get();
        const relatedItemUids: string[] = [];
        const retaledItemsMap: any[] = [];
        const itemProfileCollection = itemProfileCollectionRead.docs;

        itemProfileCollection.forEach(await function (itemProfile) {
            const itemProfileItemUid:string = itemProfile.data()['item_profile_item_uid'];
            const itemProfileAttributes: string[] = itemProfile.data()['item_profile_attribute_words'];
            const itemProfileWeights: number[] = itemProfile.data()['item_profile_attribute_weights'];
            let itemScore:number = 0;

            userItemProfileAttributes.forEach(function (userAttribute) {
                if (arrayContains(itemProfileAttributes, userAttribute)) {
                    const itemWeightIndex = itemProfileAttributes.indexOf(userAttribute);
                    const userItemAttributeIndex = userItemProfileAttributes.indexOf(userAttribute);

                    const itemCount = userItemProfileCount[userItemAttributeIndex];
                    const attributeWeight = itemProfileWeights[itemWeightIndex];
                    itemScore += itemCount * attributeWeight;
                }
            });

            console.log("The value of the score of the item "+ itemProfileItemUid +" is "+ itemScore);
            retaledItemsMap.push([itemProfileItemUid, itemScore]);
        });

        console.log("Started Sorting the Map");
        //sort the map based on the score for each item in ascending order
        const sortedArray = retaledItemsMap.sort(function (a,b) {
            return a[1]<b[1]? 1:a[1]>b[1]?-1:0;
        });

        console.log("Finished Sorting the Map");

        sortedArray.forEach(function (item) {
            relatedItemUids.push(item[0]);
        });

        relatedItemUids.forEach(function (item) {
            console.log("Recommended Item UID: "+item);
        });

        console.log("Array of related item uids has been sent");
        return {
            itemUids: relatedItemUids
        }
    }catch (e) {
        //user has no item profile
        //return generic response
        const itemCollectionRead = await admin.firestore().collection("Items").where("item_category_id", "==", itemCategory).get();
        const genericItemUids: string[] = [];
        const itemCollection = itemCollectionRead.docs;

        console.log("User "+user_uid+" has no item proflie");

        itemCollection.forEach(async function (itemDoc) {
            const itemUid:string = itemDoc.data()["item_uid"];
            genericItemUids.push(itemUid)
        });

        console.log("Array of related item uids has been sent");
        return {
            itemUids: genericItemUids
        }
    }
});

async function getItemsFromStore(storeUids: string[], itemCategory: string, isForSale: boolean): Promise<string[]> {
    const itemUids: string[]= [];

    for (let x = 0; x<storeUids.length; x++){
        const storeUid = storeUids[x];

        console.log("From store "+storeUid);

        const getItemsReadPromise = await admin.firestore()
            .collection("Items")
            .where("item_store_id", "==", storeUid)
            .where("item_category_id", "==", itemCategory)
            .where("item_for_sale", "==", isForSale)
            .get();

        const getItemRead = getItemsReadPromise.docs;

        if (getItemRead.length > 0) {
            getItemRead.forEach(function (item) {
                console.log("The store " + storeUid + " has an item " + item.data()["item_uid"]);
                itemUids.push(item.data()["item_uid"])
            });
        }
    }

    return itemUids
}

async function filterWithStoreName(storeName: string, itemCategory: string, isForSale: boolean): Promise<string[]> {
    const storeUids: string[] = [];
    const matchingStoreUids: string[] = [];
    const storeNameKeywords: string[] = storeName.split(" ");
    const query = admin.firestore().collection("Store");

    const getStoreIDPromise = await query.get();
    const getStoreID = getStoreIDPromise.docs;

    getStoreID.forEach(function (store) {
        const storeData = store.data();
        const storeUid: string = storeData["store_uid"];
        const storeNameWords: string[] = storeData['store_name_keywords'];

         for (let x = 0; x<storeNameKeywords.length; x++){
             if (arrayContains(storeNameWords, storeNameKeywords[x])) {
                 console.log("The store "+storeUid+" is a match");
                 matchingStoreUids.push(storeUid);
                 break;
             }
         }

        storeUids.push(storeUid);
    });

    //get items from the stores
    console.log("Returning the item list");

    return getItemsFromStore(matchingStoreUids, itemCategory, isForSale);
}

async function getItemsWithFilters(itemUids: string[], budget: number, isForSale: boolean, rating: number): Promise<string[]> {
    const resultItemUids:string[] = [];

    for (let x = 0; x < itemUids.length; x++) {
        const itemUid = itemUids[x];
        let query = admin.firestore()
            .collection("Items")
            .where("item_uid", "==", itemUid)
            .where("item_for_sale","==", isForSale);

        if (rating>0){
            console.log("The base rating is " + rating);
            const minRating:number = rating-0.5;
            const maxRating:number = rating+0.5;

            query = query.where("item_average_rating","<", maxRating)
                .where("item_average_rating",">=", minRating)
        }

        if (budget >= 0) {
            console.log("The base budget is " + budget);

            const maxBudget:number = budget + (budget * 0.2);
            const minBudget:number = budget - (budget * 0.2);

            query = query.where("item_price","<=", maxBudget)
                .where("item_price",">=", minBudget)
        }

        console.log("Checking items " + itemUid);

        const itemReadPromise = await query.get();
        const itemRead = itemReadPromise.docs;

        itemRead.forEach(function (item) {
            const itemData = item.data();
            const itemDataUid:string = itemData["item_uid"];

            resultItemUids.push(itemDataUid);
        });
    }

    console.log("Returning filtered items");
    return resultItemUids
}

async function filterWithStoreNameAndOthers(storeName: string,
                                            itemCategory: string,
                                            budget: number,
                                            rating: number,
                                            isForSale: boolean): Promise<string[]> {
    const resultItemUids: string[] = [];
    const storeUids: string[] = [];
    const matchingStoreUids: string[] = [];
    const storeNameKeywords: string[] = storeName.split(" ");
    const query = admin.firestore().collection("Store");

    const getStoreIDPromise = await query.get();
    const getStoreID = getStoreIDPromise.docs;

    getStoreID.forEach(function (store) {
        const storeData = store.data();
        const storeUid: string = storeData["store_uid"];
        const storeNameWords: string[] = storeData['store_name_keywords'];

        for (let x = 0; x<storeNameKeywords.length; x++){
            if (arrayContains(storeNameWords, storeNameKeywords[x])) {
                console.log("The store "+storeUid+" is a match");
                matchingStoreUids.push(storeUid);
                break;
            }
        }

        storeUids.push(storeUid);
    });

    const itemUids: string[] =  await getItemsFromStore(matchingStoreUids, itemCategory, isForSale);


    console.log("Returning all the filtered items");
    return getItemsWithFilters(itemUids, budget, isForSale, rating);
}

async function filterWithStoreNameAndLocationAndOthers(storeName: string,
                                            location: string,
                                            itemCategory: string,
                                            budget: number,
                                            rating: number,
                                            isForSale: boolean): Promise<string[]> {
    const resultItemUids: string[] = [];
    const storeUids: string[] = [];
    const matchingStoreUids: string[] = [];
    const storeLocationKeyWords:string[] = location.split(" ");
    const storeNameKeywords: string[] = storeName.split(" ");
    const query = admin.firestore().collection("Store");

    const getStoreIDPromise = await query.get();
    const getStoreID = getStoreIDPromise.docs;

    getStoreID.forEach(function (store) {
        const storeData = store.data();
        const storeUid: string = storeData["store_uid"];
        const storeNameWords: string[] = storeData['store_name_keywords'];
        const storeLocationWords: string[] = storeData['store_location_keywords'];

        for (let x = 0; x<storeNameKeywords.length; x++){
            if (arrayContains(storeNameWords, storeNameKeywords[x])) {
                console.log("The store "+storeUid+" is a match");

                for(let y =0; y<storeLocationKeyWords.length; y++){
                    if (arrayContains(storeNameWords, storeLocationWords[y])){
                        matchingStoreUids.push(storeUid);
                        break;
                    }
                }

                if (arrayContains(matchingStoreUids, storeUid)){
                    break
                }
            }
        }

        storeUids.push(storeUid);
    });

    const itemUids: string[] =  await getItemsFromStore(matchingStoreUids, itemCategory, isForSale);

    console.log("Returning all the filtered items");

    return getItemsWithFilters(itemUids, budget, isForSale, rating);
    // for (let x =0; x<itemUids.length; x++){
    //     const itemUid = itemUids[x];
    //     const itemReadPromise = await admin.firestore().collection("Items").where("item_uid", "==", itemUid).get()
    //     const itemRead = itemReadPromise.docs[0].data();
    //     const itemPrice:number = itemRead["item_price"];
    //     const itemAverageRating: number = itemRead["item_average_rating"];
    //     const itemIsForSale:boolean = itemRead["item_is_for_sale"];
    //
    //     const maxBudget = budget + (budget *0.2);
    //     const minBudget = budget - (budget * 0.2);
    //
    //     if(itemIsForSale === isForSale){
    //         if (rating>=0){
    //             if (itemAverageRating<=rating){
    //                 if (maxBudget>=0 && minBudget>=0){
    //                     if (itemPrice<=maxBudget && itemPrice>=minBudget){
    //                         resultItemUids.push(itemUid)
    //                     }
    //                 } else {
    //                     resultItemUids.push(itemUid)
    //                 }
    //             }
    //         }else {
    //             if (maxBudget>=0 && minBudget>=0){
    //                 if (itemPrice<=maxBudget && itemPrice>=minBudget){
    //                     resultItemUids.push(itemUid)
    //                 }
    //             }else {
    //                 resultItemUids.push(itemUid)
    //             }
    //         }
    //     }
    // }
}

async function filterWithLocationAndOthers(location: string,
                                           itemCategory: string,
                                           budget: number,
                                           rating: number,
                                           isForSale: boolean): Promise<string[]> {
    const resultItemUids: string[] = [];
    const storeUids: string[] = [];
    const matchingStoreUids: string[] = [];
    const storeLocationKeyWords:string[] = location.split(" ");
    const query = admin.firestore().collection("Store");

    const queryResultPromise = await query.get();
    const queryResult = queryResultPromise.docs;

    queryResult.forEach(function (store) {
        const storeData = store.data();
        const storeUid: string = storeData["store_uid"];
        const storeLocationWords: string[] = storeData['store_location_keywords'];

        for (let x = 0; x<storeLocationKeyWords.length; x++){
            if (arrayContains(storeLocationWords, storeLocationKeyWords[x])) {
                console.log("The store "+storeUid+" is a match");
                matchingStoreUids.push(storeUid);
                break;
            }
        }
    });

    const itemUids: string[] =  await getItemsFromStore(matchingStoreUids, itemCategory, isForSale);

    console.log("Returning all the filtered items");

    return getItemsWithFilters(itemUids, budget, isForSale, rating);
    // for (let x =0; x<itemUids.length; x++){
    //     const itemUid = itemUids[x];
    //     const itemReadPromise = await admin.firestore().collection("Items").where("item_uid", "==", itemUid).get()
    //     const itemRead = itemReadPromise.docs[0].data();
    //     const itemPrice:number = itemRead["item_price"];
    //     const itemAverageRating: number = itemRead["item_average_rating"];
    //     const itemIsForSale:boolean = itemRead["item_is_for_sale"];
    //
    //     const maxBudget = budget + (budget *0.2);
    //     const minBudget = budget - (budget * 0.2);
    //
    //     if(itemIsForSale === isForSale){
    //         if (rating>=0){
    //             if (itemAverageRating<=rating){
    //                 if (maxBudget>=0 && minBudget>=0){
    //                     if (itemPrice<=maxBudget && itemPrice>=minBudget){
    //                         resultItemUids.push(itemUid)
    //                     }
    //                 } else {
    //                     resultItemUids.push(itemUid)
    //                 }
    //             }
    //         }else {
    //             if (maxBudget>=0 && minBudget>=0){
    //                 if (itemPrice<=maxBudget && itemPrice>=minBudget){
    //                     resultItemUids.push(itemUid)
    //                 }
    //             }else {
    //                 resultItemUids.push(itemUid)
    //             }
    //         }
    //     }
    // }
}

async function filterWithBudget(budget: number, itemCategory: string, isForSale: boolean): Promise<string[]> {
    const resultItemUids: string[] = [];
    const budgetTolerance: number = budget * 0.2;
    const budgetMax: number = budget + budgetTolerance;
    const budgetMin: number = budget - budgetTolerance;

    const itemReadPromise = await admin.firestore().collection("Items")
        .where("item_category_id", "==", itemCategory)
        .where("item_price", "<=", budgetMax)
        .where("item_price", ">=", budgetMin)
        .where("item_for_sale", "==", isForSale)
        .orderBy("item_price", "asc")
        .get();

    const itemRead = itemReadPromise.docs;

    itemRead.forEach(function (item) {
        resultItemUids.push(item.data()["item_uid"])
    });

    return resultItemUids
}

async function filterWithLocation(location: string, itemCategory: string, isForSale: boolean): Promise<string[]> {
    const matchingStoreUids:string[] = [];

    const query = admin.firestore().collection("Store");
    const locationKeywords = location.split(" ");

    const queryResultPromise = await query.get();
    const queryResult = queryResultPromise.docs;

    queryResult.forEach(function (store) {
        const storeData = store.data();
        const storeUid: string = storeData["store_uid"];
        const storeLocationWords: string[] = storeData['store_location_keywords'];

        for (let x = 0; x<locationKeywords.length; x++){
            if (arrayContains(storeLocationWords, locationKeywords[x])) {
                console.log("The store "+storeUid+" is a match");
                matchingStoreUids.push(storeUid);
                break;
            }
        }
    });

    console.log("Returning the item list");

    return getItemsFromStore(matchingStoreUids, itemCategory, isForSale);
    //
    // resultStoreUids.forEach(async function (storeUid) {
    //     const itemReadPromise = await admin.firestore()
    //         .where("item_category_id", "==", itemCategory)
    //         .where("item_store_id", '==', storeUid).get();
    //
    //     const itemRead = itemReadPromise.docs;
    //
    //     itemRead.forEach(function (item) {
    //         resultItemUids.push(item.id)
    //     })
    // });
    //
    // return resultItemUids
}

async function filterWithItemRating(itemRating: number, isForSale: boolean): Promise<string[]> {
    const resultItemUids: string[] = [];

    const itemReadPromise = await admin.firestore().collection("Items")
        .where("item_average_rating", "<=", itemRating + 0.5)
        .where("item_average_rating", ">=", itemRating - 0.5)
        .orderBy("item_average_rating", "desc")
        .where("item_for_sale", "==", isForSale)
        .get();

    const itemRead = itemReadPromise.docs;

    itemRead.forEach(function (item) {
        console.log("The item " + item.data()["item_uid"]
            + " has a rating of " + item.data()["item_average_rating"]
        + " it is for sale: "+ isForSale);

        resultItemUids.push(item.data()["item_uid"])
    });

    return resultItemUids;
}

async function filterWithIsForSale(isForSale: boolean):Promise<string[]> {
    const resultItemUids: string[] = [];
    const itemReadPromise = await admin.firestore()
        .collection("Items/")
        .where("item_for_sale", "==", isForSale)
        .get();

    const itemRead = itemReadPromise.docs;

    itemRead.forEach(function (item) {
        resultItemUids.push(item.data()["item_uid"])
    });
    return resultItemUids;
}

//return filter items
export const filterItems = functions.https.onCall(async (data, context)=>{
    // const searchString:string = data.item_category;
    const itemCategory:string = data.item_category;
    const storeName:string = data.store_name.toLowerCase();
    const budget:number = data.budget;
    const location:string = data.location.toLowerCase();
    const itemRating:number = data.item_rating;
    const isForSale: boolean = data.is_for_sale;
    let itemUids: string[] = [];

    console.log("Data Passed: Item Category "+itemCategory);
    console.log("Data Passed: Store Name "+storeName);
    console.log("Data Passed: Budget "+budget);
    console.log("Data Passed: Location "+location);
    console.log("Data Passed: Item Rating "+itemRating);
    console.log("Data Passed: For Sale "+isForSale);

    //if only store name is given
    if (storeName !== "" &&
        budget < 0 &&
        location === "" &&
        itemRating === 0) {
        console.log("Filtering with only store name");

        const filterWithStoreNamePromise:string[] = await filterWithStoreName(storeName, itemCategory, isForSale);
        itemUids = itemUids.concat(filterWithStoreNamePromise);

        return {
            filterResult: itemUids
        }
    }

    //for budget only
    if (budget > 0 &&
        storeName === "" &&
        location === "" &&
        itemRating === 0) {
        console.log("Filtering with only budget");
        const filterWithBudgetPromise:string[] = await filterWithBudget(budget, itemCategory, isForSale);
        itemUids = itemUids.concat(filterWithBudgetPromise);

        return {
            filterResult: itemUids
        }
    }

    //filter with location only
    if (location !== "" &&
        storeName !== "" &&
        budget < 0 &&
        itemRating === 0){
        console.log("Filtering with only location");

        const filterWithLocationPromise:string[] = await filterWithLocation(location, itemCategory, isForSale);
        itemUids = itemUids.concat(filterWithLocationPromise)

        return {
            filterResult: itemUids
        }
    }

    //filter with item rating only
    if (itemRating !== 0 &&
        storeName === "" &&
        budget < 0 &&
        location === ""){
        console.log("Filtering with rating only");

        const resultItemUids = await filterWithItemRating(itemRating, isForSale);
        itemUids = itemUids.concat(resultItemUids);

        return {
            filterResult: itemUids
        }
    }

    itemUids.forEach(function (itemUid) {
        console.log(itemUid)
    });

    //is for sale only
    if (itemRating === 0 &&
        storeName === "" &&
        budget < 0 &&
        location === ""){
        console.log("Filtering with isForSale only");

        itemUids = itemUids.concat(await filterWithIsForSale(isForSale));

        return {
            filterResult: itemUids
        }
    }

    //if store name is given along with other filters; except for store location
    if (storeName !== "" &&
        location === "") {
        console.log("Filtering with store name and other filters without location");
        // const filterWithStoreNamePromise:string[] =
        //     await filterWithStoreNameAndOthers(storeName,
        //         itemCategory,
        //         budget,
        //         itemRating,
        //         isForSale);
        // itemUids = itemUids.concat(filterWithStoreNamePromise);

        return {
            filterResult: await filterWithStoreNameAndOthers(storeName,
                itemCategory,
                budget,
                itemRating,
                isForSale)
        }
    }

    //if store name is given along with other filters;
    if (storeName !== "" &&
        location !== "") {
        console.log("Filtering with storename and location and others");

        const filterWithStoreNamePromise:string[] =
            await filterWithStoreNameAndLocationAndOthers(storeName,
                location,
                itemCategory,
                budget,
                itemRating,
                isForSale);
        itemUids = itemUids.concat(filterWithStoreNamePromise);

        return {
            filterResult: itemUids
        }
    }

    //if location is given along with other filters; except for store name
    if (storeName === "" &&
        location !== "") {
        console.log("Filtering with and location and others");

        const filterWithStoreNamePromise:string[] =
            await filterWithLocationAndOthers(location,
                itemCategory,
                budget,
                itemRating,
                isForSale);

        itemUids = itemUids.concat(filterWithStoreNamePromise);

        return {
            filterResult: itemUids
        }
    }

    return {
        filterResult: itemUids
    }
});

export const updateUserItemProfile = functions.region('asia-northeast1')
    .firestore
    .document('Cart_Items/{cartGroupUid}/cart_items/{cartItemKey}')
    .onCreate(async (snapshot, context) => {
        const itemDoc = snapshot.data();
        const itemUid = itemDoc['cart_item_item_uid'];
            const user_uid = itemDoc['cart_item_buyer_uid'];

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

            //update the item list in the cart group
            await admin.firestore().doc("");

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

export const logNewCartItem = functions
    .region('asia-northeast1')
    .firestore
    .document("Cart_Items/{cartGroupKey}/cart_items/{cartItemKey}")
    .onCreate(async (snapshot, context) => {
        //
        const data = snapshot.data();
        const cartGroupKey = data["cart_item_group_uid"];
        const cartItemKey:string = snapshot.id;
        const isDeliverable:boolean = data["cart_item_Deliverable"];
        const eventUid:string = data["cart_item_event_uid"];

        //get event location
        const eventReadPromise = await admin.firestore().doc("Event/"+eventUid).get();
        const eventRead = eventReadPromise.data();
        const eventLocation: string = eventRead["event_location"];

        if (isDeliverable){
            //update the cartkey to the document
            return admin.firestore().doc("Cart_Items/"+cartGroupKey+"/cart_items/"+cartItemKey).update({
                cart_item_id: cartItemKey,
                cart_item_delivery_location: eventLocation
            })
        }else {
            //update the cartkey to the document
            return admin.firestore().doc("Cart_Items/"+cartGroupKey+"/cart_items/"+cartItemKey).update({
                cart_item_id: cartItemKey
            })
        }
    });

//Events//

export const logNewEvent = functions.region('asia-northeast1').firestore.document('Event/{eventKey}')
    .onCreate(async (snapshot, context) => {
        const events = snapshot.data();
        const eventName:string = events['event_name'];
        const eventCreatorID:string = events['event_creator_id'];
        const eventCategory:string = events['event_category_id'];

        console.log("Event Name: " + eventName);
        console.log("Creator ID: " + eventCreatorID);

        //console add event_projected_budget_spent
        await admin.firestore().doc("Event/"+snapshot.id).update({
            event_projected_budget_spent: 0
        });

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

        //add default event categories to the event
        const defaultItemCategoriesPromise = await admin.firestore()
            .doc("Default_Event_Item_Category/"+eventCategory).get();
        const defaultItemCategories:string[] = defaultItemCategoriesPromise.data()['deic_item_category_id'];

        defaultItemCategories.forEach(async function (itemCategory) {
           await admin.firestore().doc("Custom_Event_Item_Category/"+snapshot.id
               +"/ceic_item_category/"+itemCategory).set({
               ceic_item_set_budget: 0,
               ceic_item_actual_budget: 0,
               ceic_item_item_category: itemCategory,
               ceic_item_event_uid: snapshot.id
           })
        });
//
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

        ///////
        //delete sponsor's list
        const sponsorsListDeletePromise = await admin.firestore().doc("Sponsors_List/"+eventUid).delete();

        //delete from sponsored events
        const sponsoredEventDeletePromise = await admin.firestore()
            .collection("Sponsored_Events").where("sponsored_event_event_uid", "==", eventUid).get();

        const sponsoredEventDelete = sponsoredEventDeletePromise.docs;

        sponsoredEventDelete.forEach(async function (events) {
           const sponsoredEvent = events.data();
           const sponsoredEventUid = sponsoredEvent['sponsored_event_event_uid'];
           const sponsorUid = sponsoredEvent['sponsored_event_user_uid'];
           const sponsoredEventCategory = sponsoredEvent['sponsored_event_event_category_id'];

           await admin.firestore().doc('Sponsored_Event'+sponsorUid+'/'+sponsoredEventCategory+'/'+sponsoredEventUid).delete()
           // await admin.firestore().doc("Sponsors_List/"+sponsorUid+"/"sponsoredEventCategory+"/"+sponsoredEventUid).delete();
        });

        //delete from attended events
        const attendedEventDeletePromise = await admin.firestore()
            .collection("Attended_Events").where("attended_event_event_uid", "==", eventUid).get();

        const attendedEventDelete = sponsoredEventDeletePromise.docs;

        attendedEventDelete.forEach(async function (events) {
            const attendedEvent = events.data();
            const attendedEventUid = attendedEvent['attended_event_event_uid'];
            const attendedUid = attendedEvent['attended_event_user_uid'];
            const attendedEventCategory = attendedEvent['attended_event_event_category_id'];

            await admin.firestore().doc('Sponsored_Event'+attendedUid+'/'+attendedEventCategory+'/'+attendedEventUid).delete()
            // await admin.firestore().doc("Sponsors_List/"+sponsorUid+"/"sponsoredEventCategory+"/"+sponsoredEventUid).delete();
        });

        //delete attendees's list
        const attendeesListDeletePromise = await admin.firestore().doc("Attendees_List/"+eventUid).delete();


        //delete custom item list
        await  admin.firestore().doc("Custom_Event_Item_Category/"+eventUid).delete();

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

export const updateWeddingIDFOnDelete = functions.firestore.document("TF/event_tf/Wedding/{eventID}")
    .onDelete(async (snapshot, context) => {
        const eventCategory = "Wedding";
        const eventTfPromise = await admin.firestore().collection("TF/event_tf/"+eventCategory).get();
        const numberOfEventsInCategory:number = eventTfPromise.size;

        if (numberOfEventsInCategory === 0) {
            console.log('This TF score of the words in this event has not changed');
            return null;
        }else {
            console.log('This TF score of the words in this event has changed');
            console.log('System is gonna update all idf for all events in the '+eventCategory+' Category');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('event_tf').collection(eventCategory).get();

            const eventDocs = querySnapshot.docs;

            await eventDocs.forEach(async function (eventDoc) {
                const doc = eventDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfEventUid: string = doc['tf_event_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the event: " + tfEventUid);
                const weightArray: number[] = await getEventIDFWeightArray(tfWords, eventCategory);

                const idfWritePromise = await writeToEventIDFCollection(tfEventUid, eventCategory, tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToEventProfileCollection(tfEventUid, eventCategory, tfWords, tfidfArray);
            });

            console.log("The Entire "+eventCategory+" IDF has been updated");
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

export const updatePartyIDFOnDelete = functions.firestore.document("TF/event_tf/Party/{eventID}")
    .onDelete(async (snapshot, context) => {
        const eventCategory = "Party";
        const eventTfPromise = await admin.firestore().collection("TF/event_tf/"+eventCategory).get();
        const numberOfEventsInCategory:number = eventTfPromise.size;

        if (numberOfEventsInCategory === 0) {
            console.log('This TF score of the words in this event has not changed');
            return null;
        }else {
            console.log('This TF score of the words in this event has changed');
            console.log('System is gonna update all idf for all events in the '+eventCategory+' Category');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('event_tf').collection(eventCategory).get();

            const eventDocs = querySnapshot.docs;

            await eventDocs.forEach(async function (eventDoc) {
                const doc = eventDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfEventUid: string = doc['tf_event_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the event: " + tfEventUid);
                const weightArray: number[] = await getEventIDFWeightArray(tfWords, eventCategory);

                const idfWritePromise = await writeToEventIDFCollection(tfEventUid, eventCategory, tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToEventProfileCollection(tfEventUid, eventCategory, tfWords, tfidfArray);
            });

            console.log("The Entire "+eventCategory+" IDF has been updated");
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

export const updateBusinessEventsIDFOnDelete = functions.firestore.document("TF/event_tf/Business_Events/{eventID}")
    .onDelete(async (snapshot, context) => {
        const eventCategory = "Business_Events";
        const eventTfPromise = await admin.firestore().collection("TF/event_tf/"+eventCategory).get();
        const numberOfEventsInCategory:number = eventTfPromise.size;

        if (numberOfEventsInCategory === 0) {
            console.log('This TF score of the words in this event has not changed');
            return null;
        }else {
            console.log('This TF score of the words in this event has changed');
            console.log('System is gonna update all idf for all events in the '+eventCategory+' Category');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('event_tf').collection(eventCategory).get();

            const eventDocs = querySnapshot.docs;

            await eventDocs.forEach(async function (eventDoc) {
                const doc = eventDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfEventUid: string = doc['tf_event_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the event: " + tfEventUid);
                const weightArray: number[] = await getEventIDFWeightArray(tfWords, eventCategory);

                const idfWritePromise = await writeToEventIDFCollection(tfEventUid, eventCategory, tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToEventProfileCollection(tfEventUid, eventCategory, tfWords, tfidfArray);
            });

            console.log("The Entire "+eventCategory+" IDF has been updated");
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

export const updateSportsEventsIDFOnDelete = functions.firestore.document("TF/event_tf/Sports_Events/{eventID}")
    .onDelete(async (snapshot, context) => {
        const eventCategory = "Sports_Events";
        const eventTfPromise = await admin.firestore().collection("TF/event_tf/"+eventCategory).get();
        const numberOfEventsInCategory:number = eventTfPromise.size;

        if (numberOfEventsInCategory === 0) {
            console.log('This TF score of the words in this event has not changed');
            return null;
        }else {
            console.log('This TF score of the words in this event has changed');
            console.log('System is gonna update all idf for all events in the '+eventCategory+' Category');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('event_tf').collection(eventCategory).get();

            const eventDocs = querySnapshot.docs;

            await eventDocs.forEach(async function (eventDoc) {
                const doc = eventDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfEventUid: string = doc['tf_event_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the event: " + tfEventUid);
                const weightArray: number[] = await getEventIDFWeightArray(tfWords, eventCategory);

                const idfWritePromise = await writeToEventIDFCollection(tfEventUid, eventCategory, tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToEventProfileCollection(tfEventUid, eventCategory, tfWords, tfidfArray);
            });

            console.log("The Entire "+eventCategory+" IDF has been updated");
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

export const updateCustomizedEventsIDFOnDelete = functions.firestore.document("TF/event_tf/Customized_Events/{eventID}")
    .onDelete(async (snapshot, context) => {
        const eventCategory = "Customized_Events";
        const eventTfPromise = await admin.firestore().collection("TF/event_tf/"+eventCategory).get();
        const numberOfEventsInCategory:number = eventTfPromise.size;

        if (numberOfEventsInCategory === 0) {
            console.log('This TF score of the words in this event has not changed');
            return null;
        }else {
            console.log('This TF score of the words in this event has changed');
            console.log('System is gonna update all idf for all events in the '+eventCategory+' Category');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('event_tf').collection(eventCategory).get();

            const eventDocs = querySnapshot.docs;

            await eventDocs.forEach(async function (eventDoc) {
                const doc = eventDoc.data();
                const tfWords: string[] = doc['tf_unique_words'];
                const tfEventUid: string = doc['tf_event_uid'];
                const tfScoreArray = doc['tf_tf_score'];
                const tfidfArray: number[] = [];

                console.log("We are updating the event: " + tfEventUid);
                const weightArray: number[] = await getEventIDFWeightArray(tfWords, eventCategory);

                const idfWritePromise = await writeToEventIDFCollection(tfEventUid, eventCategory, tfWords, weightArray);

                //calculate TFIDF
                for (let i = 0; i < tfWords.length; i++) {
                    tfidfArray.push(tfScoreArray[i] * weightArray[i]);
                }

                //Write profile of item
                return writeToEventProfileCollection(tfEventUid, eventCategory, tfWords, tfidfArray);
            });

            console.log("The Entire "+eventCategory+" IDF has been updated");
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
        const events = eventReadPromise.data();
        const eventCreatorUid: string = events['event_creator_id'];

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
            const events = eventAfter;
            const eventUid: string = events['event_event_uid'];
            const eventCategory: string = events['event_category_id'];
            const eventCreatorUid: string = events['event_creator_id'];

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
            const events: FirebaseFirestore.DocumentData = eventAfter;
            const eventUid: string = events['event_event_uid'];
            const eventCategory: string = events['event_category_id'];
            const eventCreatorUid: string = events['event_creator_id'];

            return admin.firestore().doc('Sponsors_List/' + eventUid).set({
                sponsors_list_list_size: 1,
                sponsors_list_user_uid_list: [eventCreatorUid],
                sponsors_list_event_uid: eventUid,
                sponsors_list_event_category: eventCategory
            })
        }
    });

export const updateEventBudgetSpent = functions.firestore
    .document("Custom_Event_Item_Category/{eventKey}/ceic_item_category/{itemCategoryKey}")
    .onUpdate(async (change, context) => {
        const after = change.after.data();
        const before = change.before.data();
        
        if (after["ceic_item_actual_budget"] === before["ceic_item_actual_budget"]){
            console.log("Money spent on the item category did not change");
            return null;
        }else {
            const budgetSpent:number = after["ceic_item_actual_budget"];
            const eventUid:string = after["ceic_item_event_uid"];

            const eventReadPromise = await admin.firestore().doc("Event/"+eventUid).get();
            const eventRead = eventReadPromise.data();
            const totalBudgetSpent: number = eventRead["event_budget_spent"];
            const oldBudgetSpent:number = totalBudgetSpent - before["ceic_item_actual_budget"];
            const newTotalBudgetSpent:number = oldBudgetSpent + budgetSpent;

            return admin.firestore().doc("Event/"+eventUid).update({
                event_budget_spent: newTotalBudgetSpent
            })
        }
    });

export const updateEventBudgetSpentOnDelete = functions.firestore
    .document("Custom_Event_Item_Category/{eventKey}/ceic_item_category/{itemCategoryKey}")
    .onDelete(async (snapshot, context) => {
        const deleted = snapshot.data();

        const budgetSpent:number = deleted["ceic_item_actual_budget"];
        const eventUid:string = deleted["ceic_item_event_uid"];
        const itemCategory:string = deleted["ceic_item_item_category"];

        const eventReadPromise = await admin.firestore().doc("Event/"+eventUid).get();
        const eventRead = eventReadPromise.data();
        const totalBudgetSpent: number = eventRead["event_budget_spent"];
        const newTotalBudgetSpent:number = totalBudgetSpent - budgetSpent;

        return admin.firestore().doc("Event/"+eventUid).update({
            event_budget_spent: newTotalBudgetSpent
        })
    });

export const updateEventProjectedBudgetSpent = functions.firestore
    .document("Custom_Event_Item_Category/{eventKey}/ceic_item_category/{itemCategoryKey}")
    .onUpdate(async (change, context) => {
        const after = change.after.data();
        const before = change.before.data();

        if (after["ceic_item_set_budget"] === before["ceic_item_set_budget"]){
            console.log("Money spent on the item category did not change");
            return null;
        }else {
            const budgetSet:number = after["ceic_item_set_budget"];
            const eventUid:string = after["ceic_item_event_uid"];
            const itemCategory:string = after["ceic_item_item_category"];

            const eventReadPromise = await admin.firestore().doc("Event/"+eventUid).get();
            const eventRead = eventReadPromise.data();

            const totalProjectedBudget: number = eventRead["event_projected_budget_spent"];
            console.log("totalProjectedBudget "+ totalProjectedBudget);
            console.log("budgetSet "+budgetSet);

            if ( !isNaN(totalProjectedBudget) && totalProjectedBudget !== 0) {
                const oldTotalBudgetSpent: number = totalProjectedBudget - before["ceic_item_set_budget"];
                const newTotalBudgetSpent: number = oldTotalBudgetSpent + budgetSet;

                return admin.firestore().doc("Event/" + eventUid).update({
                    event_projected_budget_spent: newTotalBudgetSpent
                })
            }else {
                return admin.firestore().doc("Event/"+eventUid).update({
                    event_projected_budget_spent: budgetSet
                })
            }
        }
    });

export const updateEventProjectedBudgetSpentOnDelete = functions.firestore
    .document("Custom_Event_Item_Category/{eventKey}/ceic_item_category/{itemCategoryKey}")
    .onDelete(async (snapshot, context) => {
        const deleted = snapshot.data();
        const budgetSet:number = deleted["ceic_item_set_budget"];
        const eventUid:string = deleted["ceic_item_event_uid"];
        const itemCategory:string = deleted["ceic_item_item_category"];

        const eventReadPromise = await admin.firestore().doc("Event/"+eventUid).get();
        const eventRead = eventReadPromise.data();

        const totalProjectedBudget: number = eventRead["event_projected_budget_spent"];
        console.log("totalProjectedBudget "+ totalProjectedBudget);
        console.log("budgetSet "+budgetSet);

        if ( !isNaN(totalProjectedBudget)) {
            const newTotalBudgetSpent: number = totalProjectedBudget - budgetSet;

            return admin.firestore().doc("Event/" + eventUid).update({
                event_projected_budget_spent: newTotalBudgetSpent
            })
        }else {
            return null
        }
    });

export const getUnusedItemCategories = functions.https.onCall(async (data, context)=>{
    // const searchString:string = data.item_category;
    const eventUid:string = data.event_uid;
    const usedItemCategories: string[] = [];
    const unusedItemCategories: string[] = [];
    const result: string[] = [];

    console.log("Event selected is "+ eventUid);

    const usedItemCategoryReadPromise = await admin.firestore()
        .collection("Custom_Event_Item_Category/"+eventUid+"/ceic_item_category").get();

    const usedItemCategoryRead = usedItemCategoryReadPromise.docs;

    usedItemCategoryRead.forEach(function (itemCategory) {
        usedItemCategories.push(itemCategory.data()["ceic_item_item_category"])
        console.log("The item category "+ itemCategory.data()["ceic_item_item_category"]
            + " is in the event "+eventUid)
    });

    const unusedItemCategoryReadPromise = await admin.firestore()
        .collection("Item_Category").get();

    const unusedItemCategoryRead = unusedItemCategoryReadPromise.docs;

    unusedItemCategoryRead.forEach(function (itemCategory) {
        unusedItemCategories.push(itemCategory.data()["itemCategory_uid"])
    });

    unusedItemCategories.forEach(function (itemCategory) {
       if (!arrayContains(usedItemCategories, itemCategory)){
           console.log("The item category "+ itemCategory+ " is not in the event "+eventUid)
           result.push(itemCategory)
       }
    });

    return {
        itemCategories: result
    }
});