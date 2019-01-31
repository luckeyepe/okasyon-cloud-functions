import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

exports.logNewUser = functions.region('asia-northeast1').firestore
.document('Users/{user}')
.onCreate((documentSnapshot, context) =>{
    const user = documentSnapshot.data();
    const userDeviceToken = user['user_token'];
    const userName = ""+user['user_firstName']+" "+user['user_lastName'];
    console.log("User Device Token: "+userDeviceToken);
    console.log("User Full Name: "+userName); 
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

exports.logNewItems = functions.region('asia-northeast1').firestore
.document('Items/{item}')
.onCreate((snapshot, context) => {
    const item = snapshot.data();
    const itemName = item['item_name'];
    const storeUid = item['item_store_id'];

    console.log("Item Name: " + itemName);
    console.log("Store ID: " + storeUid);
    return admin.firestore().collection('Number_of_Items').doc(item['item_category_id'])
        .get()
        .then(function (doc) {
            const result = doc.data();
            console.log("Result Data: "+result);
            const itemCount = Number(result['number_of_items_in_category']);
            console.log(item['item_category_id']+" Count: "+itemCount);

            return admin.firestore().collection('Number_of_Items').doc(item['item_category_id']).update({
                number_of_items_in_category: itemCount + 1,
            }).then(function (totalItems) {
                admin.firestore().collection('Number_of_Items').doc('Total').get().then(function(totalDoc) {
                    if (totalDoc.exists) {
                        const totalResult = totalDoc.data();
                        let totalItemCount = Number(totalResult['number_of_items_in_category']);

                        console.log("Total Item Count"+totalItemCount);

                        totalItemCount = totalItemCount+1;

                        return admin.firestore().collection('Number_of_Items').doc('Total').update({
                            number_of_items_in_category: totalItemCount,
                            number_of_items_item_category: 'Total'
                        });
                    }else {
                        console.log('No such document!');
                        return null;
                    }
                }).catch(function (error) {
                    console.log("Error getting total doc: "+ error);
                });
            });
        });
});

export const onItemDelete = functions
    .firestore
    .document('Items/{itemID}')
    .onDelete((snapshot, context) => {
       const deletedItem = snapshot.data();
       const itemName = deletedItem['item_name'];
       const storeUid = deletedItem['item_store_id'];

       console.log("Item Name: " + itemName);
       console.log("Store ID: " + storeUid);
       return admin.firestore().collection('Number_of_Items').doc(deletedItem['item_category_id'])
           .get()
           .then(function (doc) {
               const result = doc.data();

               console.log("Result Data: "+result);

               const itemCount = Number(result['number_of_items_in_category']);
               console.log(deletedItem['item_category_id']+" Count: "+itemCount);

               return admin.firestore().collection('Number_of_Items').doc(deletedItem['item_category_id']).update({
                   number_of_items_in_category: itemCount - 1,
               }).then(function (totalItems) {
                   admin.firestore().collection('Number_of_Items').doc('Total').get().then(function(totalDoc) {
                       if (totalDoc.exists) {
                           const totalResult = totalDoc.data();
                           let totalItemCount = Number(totalResult['number_of_items_in_category']);

                           console.log("Total Item Count"+totalItemCount);

                           totalItemCount = totalItemCount-1;

                           return admin.firestore().collection('Number_of_Items').doc('Total').update({
                               number_of_items_in_category: totalItemCount,
                               number_of_items_item_category: 'Total'
                           }).then(function () {
                               admin.firestore().collection('TF')
                                   .doc('tf')
                                   .collection(deletedItem['item_category_id'])
                                   .doc(deletedItem['item_uid']).delete().then(function () {
                                       admin.firestore().collection('IDF')
                                           .doc('idf')
                                           .collection(deletedItem['item_category_id'])
                                           .doc(deletedItem['item_uid'])
                                           .delete()
                               })
                           })

                       }else {
                           console.log('No such document!');
                           return null;
                       }
                   }).catch(function (error) {
                       console.log("Error getting total doc: "+ error);
                   });
               });
           });
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
            && itemAfter['item_uid'] === itemBefore['item_uid']){

            console.log("Item has no new data");

            return null;
        }else {
            console.log("Item has updated data");

            const itemName = itemAfter['item_name'];
            const itemDescription: string = itemAfter['item_description'];
            const itemPriceDescription: string = itemAfter['item_price_description'];
            const itemDoc: string = itemName.concat(" ", itemDescription, " ", itemPriceDescription);

            return admin.firestore().collection('Items').doc(itemAfter['item_uid']).update({item_doc: itemDoc});
        }
    });

export const updateTF = functions.region('asia-northeast1').firestore.document('Items/{itemID}')
    .onUpdate((change, context) =>{
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

            return admin.firestore().collection('TF').doc('tf').collection(itemAfter['item_category_id']).doc(itemAfter['item_uid']).set({
                tf_unique_word_count: uniqueWordCount,
                tf_total_word_count: totalWordCount,
                tf_unique_words: uniqueWordArray,
                tf_unique_words_count: wordCountArray,
                tf_item_uid: itemAfter['item_uid'],
                tf_tf_score: tfArray
            })

        }
    });

async function getNumberOfItemsInCategory(itemCategory: string): Promise<number>{
    const snapshot = await admin.firestore().collection('Number_of_Items')
        .doc(itemCategory)
        .get();
    const data = snapshot.data();
    const numberOfItems:number = data['number_of_items_in_category'];

    console.log("Method: Number of Items in the category: Cake_and_Pastries is "+numberOfItems);

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
    console.log("Number of Items in the category: Cake_and_Pastries is " + numberOfItems);

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


// export const updateTF = functions.region('asia-northeast1').firestore.document('Items/{itemID}').onUpdate((change, context) =>{
// export const updateCakeAndPastriesIDF = functions.firestore.document("TF/tf/Cake_and_Pastries/{itemCategory}")
//     .onUpdate(async (change, context) => {
//         const itemBefore = change.before.data();
//         const itemAfter = change.after.data();
//
//         if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
//             console.log('This TF score of the words in this item has not changed');
//             return null;
//         } else {
//             console.log('This TF score of the words in this item has changed');
//
//             const tfWords:string[] = itemAfter['tf_unique_words'];
//             const tfItemUid:string = itemAfter['tf_item_uid'];
//
//             const weightArray = await getIDFWeightArray(tfWords);
//
//             return await admin.firestore()
//                 .collection('IDF')
//                 .doc('idf')
//                 .collection('Cake_and_Pastries')
//                 .doc(tfItemUid).set({
//                 idf_item_uid: tfItemUid,
//                 idf_words: tfWords,
//                 idf_weight: weightArray
//             });
//         }
//     });

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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Cake_and_Pastries');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Cake_and_Pastries')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Gowns');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Gowns')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
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
            console.log('System is gonna update all idf for all items in the Catering Service');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Catering_Service').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Catering_Service');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Catering_Service')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
            });

            console.log("The Entire Catering Services IDF has been updated");
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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Church');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Church')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'DJ');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('DJ')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
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
            console.log('System is gonna update all idf for all items in the Event Coordinator');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Event_Coordinator').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Event_Coordinator');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Event_Coordinator')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
            });

            console.log("The Entire Event Coordinator IDF has been updated");
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
            console.log('System is gonna update all idf for all items in the Event Entertainer');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Event_Entertainer').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Event_Entertainer');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Event_Entertainer')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
            });

            console.log("The Entire Event Entertainer IDF has been updated");
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
            console.log('System is gonna update all idf for all items in the Event Stylist');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Event_Stylist').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Event_Stylist');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Event_Stylist')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
            });

            console.log("The Entire Event Stylist IDF has been updated");
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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Flowers');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Flowers')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
            });

            console.log("The Entire Flowers IDF has been updated");
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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Hair_and_Make-up');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Hair_and_Make-up')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Host');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Host')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Jewelry');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Jewelry')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Lights');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Lights')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Photography');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Photography')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
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
            console.log('System is gonna update all idf for all items in the Printed Materials');

            const querySnapshot = await admin.firestore()
                .collection('TF')
                .doc('tf').collection('Printed_Materials').get();

            const itemDocs = querySnapshot.docs;

            await itemDocs.forEach(async function (itemDoc) {
                const doc = itemDoc.data();
                const tfWords:string[] = doc['tf_unique_words'];
                const tfItemUid:string = doc['tf_item_uid'];

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Printed_Materials');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Printed_Materials')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Sounds');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Sounds')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Suits');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Suits')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Venue');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Venue')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Videography');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Videography')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
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

                console.log("We are updating the item: "+tfItemUid);
                const weightArray = await getIDFWeightArray(tfWords, 'Wedding_Vehicle');

                return await admin.firestore()
                    .collection('IDF')
                    .doc('idf')
                    .collection('Wedding_Vehicle')
                    .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    });
            });

            console.log("The Entire Wedding_Vehicle IDF has been updated");
            return null;
        }
    });

function arrayContains(badWords: string[], word: string):boolean {
    return badWords.indexOf(word) > -1;
}

function isNumber(value: string | number): boolean
{
    return !isNaN(Number(value));
    // return !isNaN(Number(value.toString()));
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

            // for (const dirtyWord in dirtyStringArray){
            //     console.log('Dirty Word'+dirtyWord);
            //     if (dirtyWord.length>1){
            //         if (!arrayContains(badWords, dirtyWord)){
            //             cleanStringArray.push(dirtyWord.toLowerCase());
            //         }
            //     }else {
            //         if (isNumber(+dirtyWord)){
            //             cleanStringArray.push(dirtyWord.toLowerCase());
            //         }
            //     }
            // }
            // for (var i=0; i<dirtyStringArray.length;i++){
            //     if (dirtyStringArray[i].length>1){
            //         if (!arrayContains(badWords, dirtyStringArray[i])){
            //             cleanStringArray.push(dirtyStringArray[i].toLowerCase());
            //         }
            //     }else {
            //         if (isNumber(+dirtyStringArray[i])){
            //             cleanStringArray.push(dirtyStringArray[i].toLowerCase());
            //         }
            //     }
            // }

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
// function cleanAndWriteMap(dirtyString: string): Map<string, number>{
//     const articleWordsArray:string[] = ["a","an","the","I", "and", "but", "or", "nor", "for",
//     "yet", "it", "they", "him", "her", "them", "of"];
//
//     var dirtyStringArray: string[] = dirtyString.replace(/[^\w\s]|_/g,
//         function ($1) { return ' ' + $1 + ' ';})
//         .replace(/[ ]+/g, ' ')
//         .split(' ');
//
//     var placeholderStringArray:string[] = new Array(1000);
//     var count:number = 0;
//
//     for(let i=0; i<dirtyStringArray.length; i++){
//         for (let j=0; j<articleWordsArray.length; j++){
//             if (dirtyStringArray[i] !== articleWordsArray[j]){
//                 // placeholderStringArray.push(dirtyStringArray[i]);
//                 placeholderStringArray[count] = dirtyStringArray[i];
//                 count++;
//                 break;
//             }
//         }
//     }
//
//     var cleanStringArray:string[] = new Array(count);
//
//     //remove single characters
//     for(var k=0; k<count; k++){
//         if (placeholderStringArray[k].length !== 1) {
//             cleanStringArray[k] = placeholderStringArray[k];
//         }
//         console.log("Remove articles "+k+cleanStringArray[k]);
//     }
//
//     var uniqueWords: string[] = new Array(cleanStringArray.length);
//     var uniqueWordMap = new Map<string, number>();
//
//     for(let i=0; i<cleanStringArray.length; i++){
//         if (uniqueWords.indexOf(cleanStringArray[i]) === null){
//             uniqueWords.push(cleanStringArray[i]);
//             uniqueWordMap.set(cleanStringArray[i], 1);
//         }else {
//             uniqueWordMap.set(cleanStringArray[i], uniqueWordMap.get(cleanStringArray[i])+1);
//         }
//         // if (placeholderStringArray[k].length !== 1) {
//         //     cleanStringArray[k] = placeholderStringArray[k];
//         // }
//         // console.log("Remove articles "+k+cleanStringArray[k]);
//     }
//
//     return uniqueWordMap;
// }
//
//
// exports.modifyItems = functions.region('asia-northeast1').firestore
//     .document('Items/{itemID}')
//     .onWrite((change, context) => {
//         // // Get an object with the current document value.
//         // // If the document does not exist, it has been deleted.
//         // const data = change.after.data();
//         // const previousData = change.before.data();
//         //
//         // if (change['item_docs'] !== previousData['item_docs']) {
//         //
//         //
//         // }
//
//         if (change.after.exists) {
//             const itemDocument = change.after.data();
//             const itemUid: string = itemDocument['item_uid'];
//             const itemName: string = itemDocument['item_name'];
//             const itemDescription: string = itemDocument['item_description'];
//             const itemPriceDescription: string = itemDocument['item_price_description'];
//             const itemDirtyString: string = itemName.concat(" ", itemDescription, " ", itemPriceDescription);
//
//             //clean up comm
//             return change.after.ref.update({
//                 item_doc: cleanAndWriteMap(itemDirtyString.toLocaleLowerCase())
//             });
//         } else {
//             const itemDocument = change.after.data();
//             const itemUid: string = itemDocument['item_uid'];
//             const itemName: string = itemDocument['item_name'];
//             const itemDescription: string = itemDocument['item_description'];
//             const itemPriceDescription: string = itemDocument['item_price_description'];
//             const itemDirtyString: string = itemName.concat(" ", itemDescription, " ", itemPriceDescription);
//
//             //clean up comm
//             return change.before.ref.update({
//                 item_doc: cleanAndWriteMap(itemDirtyString.toLocaleLowerCase())
//             });
//         }
//
//
//     });