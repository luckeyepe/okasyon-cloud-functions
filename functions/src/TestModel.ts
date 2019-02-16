export class TestModel {
    name: string;
    age: number;



// export const getRelatedItems = functions.https.onCall(async (data, context)=>{
//     // const searchString:string = data.item_category;
//     const searchItemCategory:string = data.item_category;
//     const relateItemUids:string[] = [];
//     let uniqueWordArray:string[] = [];
//     let wordCountArray:number[] = [];
//     const relatedItemMap = [];
//     const user_uid = data.current_user_uid;
//
//     const userItemProfileQuery = await admin.firestore()
//         .doc('User_Item_Profile/'+user_uid+'/user_item_profile/'+searchItemCategory)
//         .get();
//
//     if (userItemProfileQuery.exists){
//         console.log('User has an existing User Item Profile');
//
//         const userItemProfileDoc = userItemProfileQuery.data();
//         uniqueWordArray = userItemProfileDoc['user_item_profile_attributes'];
//         wordCountArray = userItemProfileDoc['user_item_profile_count'];
//
//         // uniqueWordArray = userItemProfileAttributes;
//         // // for (let i =0; i<userItemProfileAttributes.length; i++){
//         // //     uniqueWordArray.push(userItemProfileAttributes[i]);
//         // // }
//         //
//         // console.log('User is here');
//         //
//         // wordCountArray = userItemProfileCount
//         // // for (let i =0; i<userItemProfileCount.length; i++){
//         // //     wordCountArray.push(userItemProfileCount[i]);
//         // // }
//     }
//
//     console.log("Looking for items that belong to the "+searchItemCategory+" category");
//     //get items with the same item category
//     const querySnapshot = await admin.firestore().collection('Item_Profile')
//         .where("item_profile_item_category", "==", searchItemCategory).get();
//
//     const resultDocs = querySnapshot.docs;
//     console.log('There are '+resultDocs.length+' in the '+searchItemCategory);
// //get items with the same item category
//
//     const readPromise = await resultDocs.forEach(async function (doc) {
//         const itemProfile = doc.data();
//         const itemUid = itemProfile['item_profile_item_uid'];
//         const itemProfileAttributeWords:string[] = itemProfile['item_profile_attribute_words'];
//         const itemProfileAttributeWeight:number[] = itemProfile['item_profile_attribute_weights'];
//         let itemScore:number = 0;
//
//         uniqueWordArray.forEach(function (attributeWord) {
//             console.log(itemProfileAttributeWords);
//             console.log(attributeWord);
//             if (arrayContains(itemProfileAttributeWords, attributeWord)){
//                 const indexOfAttributeWord = itemProfileAttributeWords.indexOf(attributeWord);
//                 const indexOfUniqueWord = uniqueWordArray.indexOf(attributeWord);
//                 const weight = itemProfileAttributeWeight[indexOfAttributeWord];
//                 const wordCount = wordCountArray[indexOfUniqueWord];
//
//                 console.log("The word "+attributeWord+" is in the query and has a score of "+(weight*wordCount));
//
//                 itemScore+=(weight*wordCount);
//             }
//         });
//
//         console.log("Stored the item "+itemUid+" with a score of "+itemScore+" to the Map");
//         relatedItemMap.push([itemUid, itemScore]);
//     });
//
//     console.log("Started Sorting the Map");
//     //sort the map based on the score for each item in ascending order
//     const sortedArray = relatedItemMap.sort(function (a,b) {
//         return a[1]<b[1]? 1:a[1]>b[1]?-1:0;
//     });
//
//     console.log("Finished Sorting the Map");
//
//     sortedArray.forEach(function (item) {
//         relateItemUids.push(item[0]);
//     });
//
//     relateItemUids.forEach(function (item) {
//         console.log("Recommended Item UID: "+item);
//     });
//
//     console.log("Array of related item uids has been sent");
//     return {
//         itemUids: relateItemUids
//     }
// });

    //function that returns a list of item from a search query
// export const searchForItem = functions.https.onCall(async (data, context)=>{
//     const searchString:string = data.query;
//     const searchItemCategory:string = data.item_category;
//     const user_uid = data.current_user_uid;
//     let searchQueryArray:string[] = [];
//     const searchTags:string[] = [];
//     const relateItemUids:string[] = [];
//     const uniqueWordArray:string[] = [];
//     const wordCountArray:number[] = [];
//     const relatedItemMap = [];
//
//     console.log("Search string for the item is "+searchString);
//
//     if (searchString.indexOf(' ') > -1){
//         searchQueryArray = searchString.split(" ");
//     } else {
//         searchQueryArray.push(searchString)
//     }
//
//     //clean up the search query
//     for(let i=0; i<searchQueryArray.length; i++){
//         searchTags.push(searchQueryArray[i])
//     }
//
//     searchTags.forEach(function (searchTag) {
//         if (!arrayContains(uniqueWordArray, searchTag)){
//             uniqueWordArray.push(searchTag);
//             wordCountArray.push(1);
//         }else {
//             const uniqueWordIndex = uniqueWordArray.indexOf(searchTag);
//             wordCountArray[uniqueWordIndex] = wordCountArray[uniqueWordIndex]+1;
//         }
//     });
//
//
//     console.log("Looking for items that belong to the "+searchItemCategory+" category");
//     //get items with the same item category
//     const querySnapshot = await admin.firestore().collection('Item_Profile')
//         .where("item_profile_item_category", "==", searchItemCategory).get();
//
//     const resultDocs = querySnapshot.docs;
//     console.log('There are '+resultDocs.length+' in the '+searchItemCategory);
//
//     const readPromise = await resultDocs.forEach(async function (doc) {
//         const itemProfile = doc.data();
//         const itemUid = itemProfile['item_profile_item_uid'];
//         const itemProfileAttributeWords:string[] = itemProfile['item_profile_attribute_words'];
//         const itemProfileAttributeWeight:number[] = itemProfile['item_profile_attribute_weights'];
//         let itemScore:number = 0;
//
//         uniqueWordArray.forEach(function (attributeWord) {
//             console.log(itemProfileAttributeWords);
//             console.log(attributeWord);
//             if (arrayContains(itemProfileAttributeWords, attributeWord)){
//                 const indexOfAttributeWord = itemProfileAttributeWords.indexOf(attributeWord);
//                 const indexOfUniqueWord = uniqueWordArray.indexOf(attributeWord);
//                 const weight = itemProfileAttributeWeight[indexOfAttributeWord];
//                 const wordCount = wordCountArray[indexOfUniqueWord];
//
//                 console.log("The word "+attributeWord+" is in the query and has a score of "+(weight*wordCount));
//
//                 itemScore+=(weight*wordCount);
//             }
//         });
//
//         console.log("Stored the item "+itemUid+" with a score of "+itemScore+" to the Map");
//         relatedItemMap.push([itemUid, itemScore]);
//     });
//
//     console.log("Started Sorting the Map");
//     //sort the map based on the score for each item in ascending order
//     const sortedArray = relatedItemMap.sort(function (a,b) {
//         return a[1]<b[1]? 1:a[1]>b[1]?-1:0;
//     });
//
//     console.log("Finished Sorting the Map");
//
//     sortedArray.forEach(function (item) {
//         relateItemUids.push(item[0]);
//     });
//
//     relateItemUids.forEach(function (item) {
//         console.log("Recommended Item UID: "+item);
//     });
//
//     console.log("Array of related item uids has been sent");
//     return {
//         itemUids: relateItemUids
//     }
// });
}