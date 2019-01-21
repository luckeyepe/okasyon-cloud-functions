import * as functions from 'firebase-functions';
import * as admin from'firebase-admin';
import {log} from "util";
import Firestore = admin.firestore.Firestore;
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
.onCreate((snapshot, context) =>{
    const item = snapshot.data();
    const itemName = item['item_name'];
    const storeUid = item['item_store_id'];
    const itemDescription: string = item['item_description'];
    const itemPriceDescription: string = item['item_price_description'];
    const itemDoc: string = itemName.concat(" ", itemDescription, " ", itemPriceDescription);

    console.log("Item Name: "+itemName);
    console.log("Store ID: "+storeUid);

    return snapshot.ref.update({item_doc: itemDoc})
});

export const onItemUpdate = functions
    .firestore
    .document('Items/{itemID}').onUpdate((change, context) =>{
        const itemBefore = change.before.data();
        const itemAfter = change.after.data();

        if (itemAfter['item_doc'] === itemBefore['item_doc']){
            console.log("Item has no new data");
            return null;
        }else {
            const itemName = itemAfter['item_name'];
            const itemDescription: string = itemAfter['item_description'];
            const itemPriceDescription: string = itemAfter['item_price_description'];
            const itemDoc: string = itemName.concat(" ", itemDescription, " ", itemPriceDescription);

            console.log("Item has updated data");
            return admin.firestore().collection('Items').doc(itemAfter['item_uid']).update({item_doc: itemDoc});
        }
    });
//
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