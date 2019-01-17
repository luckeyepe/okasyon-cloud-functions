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
    console.log("Item Name: "+itemName);
    console.log("Store ID: "+storeUid);
});

function removeArticleEnglishWords(dirtyString: string):string[] {
    const articleWordsArray:string[] = ["a","an","the","I", "and", "but", "or", "nor", "for",
    "yet", "it", "they", "him", "her", "them", "of"];

    var dirtyStringArray: string[] = dirtyString.replace(/[^\w\s]|_/g,
        function ($1) { return ' ' + $1 + ' ';})
        .replace(/[ ]+/g, ' ')
        .split(' ');

    var placeholderStringArray:string[] = new Array(1000);
    var count:number = 0;

    for(let i=0; i<dirtyStringArray.length; i++){
        for (let j=0; j<articleWordsArray.length; j++){
            if (dirtyStringArray[i] !== articleWordsArray[j]){
                // placeholderStringArray.push(dirtyStringArray[i]);
                placeholderStringArray[count] = dirtyStringArray[i];
                count++;
                break;
            }
        }
    }

    var cleanStringArray:string[] = new Array(count);

    //remove single characters
    for(var k=0; k<count; k++){
        if (placeholderStringArray[k].length !== 1) {
            cleanStringArray[k] = placeholderStringArray[k];
        }
        console.log("Remove articles "+k+cleanStringArray[k]);
    }

    return cleanStringArray;
}

exports.modifyItems = functions.region('asia-northeast1').firestore
    .document('Items/{itemID}')
    .onWrite((change, context) => {
        // Get an object with the current document value.
        // If the document does not exist, it has been deleted.
        const data = change.after.data();
        const previousData = change.before.data();
        
        if (change['item_docs'] !== previousData['item_docs']) {

            if (change.after.exists) {
                //todo
                const itemDocument = change.after.data();
                const itemName: string = itemDocument['item_name'];
                const itemDescription: string = itemDocument['item_description'];
                const itemPriceDescription: string = itemDocument['item_price_description'];
                const itemDirtyString: string = itemName.concat(" ", itemDescription, " ", itemPriceDescription);

                //clean up comm
                var cleanStringArray = removeArticleEnglishWords(itemDirtyString.toLocaleLowerCase());


                //update data (be careful of infinite loops)


            } else {
                //todo rebuild tfidf
            }
        }


    });