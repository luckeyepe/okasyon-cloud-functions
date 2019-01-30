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
    return data['number_of_items_in_category'];
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

    return itemIDArray;
}

// export const updateTF = functions.region('asia-northeast1').firestore.document('Items/{itemID}').onUpdate((change, context) =>{
export const updateCakeAndPastriesIDF = functions.firestore.document("TF/tf/Cake_and_Pastries/{itemCategory}")
    .onUpdate((change, context) => {
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
            console.log('This TF score of the words in this item has not changed');
            return null;
        } else {
            console.log('This TF score of the words in this item has changed');

            const tfWords:string[] = itemAfter['tf_unique_words'];
            const tfItemUid:string = itemAfter['tf_item_uid'];
            const idfWeight: number[] = [];
            const db = admin.firestore().collection('TF').doc('tf').collection('Cake_and_Pastries');
            let promiseArray: number[] = [];

            admin.firestore().collection('Number_of_Items')
                .doc('Cake_and_Pastries')
                .get()
                .then(function (numberDoc){
                    const number = Number(numberDoc.data()['number_of_items_in_category']);
                    console.log("Number of Items in the Cakes and Pastries Category is "+number);

                    return number;
                }).then(function (numberOfCakesAndPastries) {
                    tfWords.forEach(function (tfword) {
                        const query = db.where("tf_unique_words", "array-contains", tfword);
                        query.get().then(function (itemDoc) {
                            if (!itemDoc.empty){
                                const numberOfDocs = itemDoc.size;

                                console.log("Number of Items in the Cakes and Pastries Category is "+numberOfCakesAndPastries);
                                console.log("For item: "+tfItemUid+", there are "+numberOfDocs+"Documents");

                                let idfOfWord = Math.log(numberOfDocs/numberOfCakesAndPastries);
                                idfOfWord=idfOfWord+1;
                                idfWeight.push(idfOfWord);
                                console.log("Word IDF: "+idfOfWord);
                                console.log(idfWeight);
                            }else {
                                console.log("No such document!");
                            }

                            return idfWeight
                        }).then(function (array) {
                            promiseArray = array;
                            return promiseArray;
                        });
                    });

                    console.log("This is the before final weight array: "+promiseArray);
                    return promiseArray;

                }).then(function (weightArray) {
                    console.log("This is the final weight array: "+weightArray);
                    return admin.firestore()
                        .collection('IDF')
                        .doc('idf')
                        .collection('Cake_and_Pastries')
                        .doc(tfItemUid).set({
                        idf_item_uid: tfItemUid,
                        idf_words: tfWords,
                        idf_weight: weightArray
                    }).then(function (idfObject) {
                        console.log("Inserted into Cake and Pastries IDF: " + idfObject)
                    })
            })

            // tfWords.forEach(function (tfword) {
            //     idfWords.push(tfword);
            //     const query = db.where("tf_unique_words", "array-contains", tfword);
            //     query.get().then(function (itemDoc) {
            //         if (!itemDoc.empty){
            //             const numberOfDocs = itemDoc.size;
            //             console.log("For item: "+tfItemUid+", there are "+numberOfDocs+"Documents");
            //
            //             admin.firestore().collection('Number_of_Items')
            //                 .doc('Cake_and_Pastries')
            //                 .get()
            //                 .then(function (numberDoc){
            //                     const numberOfCakesAndPastries = numberDoc.data()['number_of_items_in_category'];
            //                     const idfOfWord = Math.log(numberOfDocs/numberOfCakesAndPastries);
            //                     idfWeight.push(idfOfWord+1);
            //                     console.log("Word IDF: "+idfOfWord+1);
            //                     console.log(idfWeight);
            //
            //                     admin.firestore()
            //                         .collection('IDF')
            //                         .doc('idf')
            //                         .collection('Cake_and_Pastries')
            //                         .doc(tfItemUid).set({
            //                         idf_item_uid: tfItemUid,
            //                         idf_words: idfWords,
            //                         idf_weight: idfWeight
            //                     });
            //                 })
            //         }else {
            //             console.log("No such document!");
            //         }
            //     })
            // });

            // console.log("IDF weight array outside of loop: "+idfWeight);
            //
            // admin.firestore()
            //     .collection('IDF')
            //     .doc('idf')
            //     .collection('Cake_and_Pastries')
            //     .doc(tfItemUid).set({
            //     idf_item_uid: tfItemUid,
            //     idf_words: idfWords,
            //     idf_weight: idfWeight
            // });
        }
    });

// export const updateCakeAndPastriesIDFBatch = functions.firestore.document("TF/tf/Cake_and_Pastries/{itemCategory}")
//     .onUpdate((change, context) => {
//         const itemBefore = change.before.data();
//         const itemAfter = change.after.data();
//
//         if (itemAfter['tf_tf_score'] === itemBefore['tf_tf_score']){
//             console.log('This TF score of the words in this item has not changed');
//             return null;
//         } else {
//             console.log('This TF score of the words in this item has changed');
//
//             admin.firestore().collection('TF').doc('tf').collection('Cake_and_Pastries')
//                 .get()
//                 .then(function (snapshot) {
//                     if (!snapshot.empty) {
//
//                         snapshot.forEach(function (docSnapshot) {
//                             const doc = docSnapshot.data();
//                             const tfWords: string[] = doc['tf_unique_words'];
//                             const tfItemUid: string = doc['tf_item_uid'];
//                             const idfWords: string[] = [];
//                             const idfWeight: number[] = [];
//                             const db = admin.firestore().collection('TF').doc('tf').collection('Cake_and_Pastries');
//
//                             tfWords.forEach(function (tfword) {
//                                 idfWords.push(tfword);
//
//                                 const query = db.where("tf_unique_words", "array-contains", tfword);
//
//                                 query.get().then(function (itemDoc) {
//                                     if (!itemDoc.empty) {
//                                         const numberOfDocs = itemDoc.size;
//
//                                         console.log("For item: " + tfItemUid + "and the word: "+tfword+
//                                             ", there are " + numberOfDocs + "Documents");
//
//                                         admin.firestore().collection('Number_of_Items')
//                                             .doc('Cake_and_Pastries')
//                                             .get()
//                                             .then(function (numberDoc) {
//                                                 const numberOfCakesAndPastries = numberDoc.data()['number_of_items_in_category'];
//                                                 const idfOfWord = Math.log(numberOfDocs / numberOfCakesAndPastries);
//                                                 idfWeight.push(idfOfWord + 1);
//                                                 console.log("Current idf for the item is "+idfWeight);
//
//                                                 return admin.firestore()
//                                                     .collection('IDF')
//                                                     .doc('idf')
//                                                     .collection('Cake_and_Pastries')
//                                                     .doc(tfItemUid).set({
//                                                     idf_item_uid: tfItemUid,
//                                                     idf_words: idfWords,
//                                                     idf_weight: idfWeight
//                                                 });
//                                             })
//                                     } else {
//                                         console.log("No such document!");
//                                     }
//                                 })
//                             });
//                         })
//                     }
//                 });
//         }
//     });

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