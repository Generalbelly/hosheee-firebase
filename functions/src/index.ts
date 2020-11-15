import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { CallableContext } from "firebase-functions/lib/providers/https";
import { LogEntry } from "firebase-functions/lib/logger";

admin.initializeApp();

export const writeLog = functions.region('asia-northeast1').https.onCall(async (data: LogEntry, context: CallableContext) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called while authenticated.');
  }
  try {
    const { severity, message, payload } = data;
    switch (severity) {
      case 'ERROR':
        functions.logger.error(message, payload);
        break;
      case 'WARNING':
        functions.logger.warn(message, payload);
        break;
      case 'INFO':
        functions.logger.info(message, payload)
        break;
      case 'DEBUG':
        functions.logger.debug(message, payload);
        break;
      default:
        functions.logger.log(message, payload);
    }
  } catch (e) {
    functions.logger.error(e.message, data);
  }
});

export const onProductUpdate = functions.region('asia-northeast1').firestore
  .document('/users/{userId}/products/{productId}')
  .onUpdate(async (snap, context) => {
    const oldProduct = snap.before.data();
    const product = snap.after.data();
    if (oldProduct['imageUrl'] !== product['imageUrl'] || oldProduct['name'] !== product['name']) {
      const querySnapshot = await admin.firestore()
        .collection('users')
        .doc(context.params['userId'])
        .collection('collection_products')
        .where('productId', '==', product['id']).get();
      for (const snapshot of querySnapshot.docs) {
        await snapshot.ref.update({
          productName: product['name'],
          productImageUrl: product['imageUrl'],
        });
      }
    }
  });

export const onProductDelete = functions.region('asia-northeast1').firestore
  .document('/users/{userId}/products/{productId}')
  .onDelete(async (snap, context) => {
    const product = snap.data();
    const querySnapshot = await admin.firestore()
      .collection('users')
      .doc(context.params['userId'])
      .collection('collection_products')
      .where('productId', '==', product['id']).get();
    for (const snapshot of querySnapshot.docs) {
      await snapshot.ref.delete();
    }
  });

export const onCollectionUpdate = functions.region('asia-northeast1').firestore
  .document('/users/{userId}/collections/{collectionId}')
  .onUpdate(async (snap, context) => {
    const oldCollection = snap.before.data();
    const collection = snap.after.data();
    if (oldCollection['imageUrl'] !== collection['imageUrl'] || oldCollection['name'] !== collection['name']) {
      const querySnapshot = await admin.firestore()
        .collection('users')
        .doc(context.params['userId'])
        .collection('collection_products')
        .where('collectionId', '==', collection['id']).get();
      for (const snapshot of querySnapshot.docs) {
        await snapshot.ref.update({
          collectionName: collection['name'],
          collectionImageUrl: collection['imageUrl'],
        });
      }
    }
  });

export const onCollectionDelete = functions.region('asia-northeast1').firestore
  .document('/users/{userId}/collections/{collectionId}')
  .onDelete(async (snap, context) => {
    const collection = snap.data();
    const querySnapshot = await admin.firestore()
      .collection('users')
      .doc(context.params['userId'])
      .collection('collection_products')
      .where('collectionId', '==', collection['id']).get();
    for (const snapshot of querySnapshot.docs) {
      await snapshot.ref.delete();
    }
  });

export const onCollectionProductCreate = functions.region('asia-northeast1').firestore
  .document('/users/{userId}/collection_products/{collectionProductId}')
  .onCreate(async (snap, context) => {
    const { userId } = context.params;
    const collectionProduct = snap.data();
    const collectionProductImageUrl = collectionProduct['productImageUrl'];
    if (!collectionProductImageUrl) {
      // imageUrlがないと意味ないので処理を終える
      functions.logger.info('collectionProduct doesn\'t have productImageUrl', {
        collectionProduct,
        context,
      });
      return;
    }
    const collectionId = collectionProduct['collectionId'];
    const collectionDoc = admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('collections')
      .doc(collectionId);
    const collectionQuerySnapshot = await collectionDoc.get();
    const collection = collectionQuerySnapshot.data();
    if (!collection) {
      functions.logger.info('collection not found', {
        collection,
        collectionProduct,
        context,
      });
      return;
    }
    functions.logger.info(`updating collection's imageUrl`, {
      collection,
      collectionProduct,
      collectionProductImageUrl,
      context,
    });
    await collectionDoc.update({
      imageUrl: collectionProductImageUrl,
    });
  });

export const onCollectionProductDelete = functions.region('asia-northeast1').firestore
  .document('/users/{userId}/collection_products/{collectionProductId}')
  .onDelete(async (snap, context) => {
    const { userId } = context.params;
    const collectionProduct = snap.data();
    const collectionProductImageUrl = collectionProduct['productImageUrl'];
    if (!collectionProductImageUrl) {
      // imageUrlがないと意味ないので処理を終える
      functions.logger.info('collectionProduct doesn\'t have productImageUrl', {
        collectionProduct,
        context,
      });
      return;
    }
    const collectionId = collectionProduct['collectionId'];
    const collectionDoc = admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('collections')
      .doc(collectionId);
    const collectionQuerySnapshot = await collectionDoc.get();
    const collection = collectionQuerySnapshot.data();
    if (!collection) {
      functions.logger.info('collection not found', {
        collection,
        collectionProduct,
        context,
      });
      return;
    }
    const collectionImageUrl = collection['imageUrl'];
    // すでにcollectionに画像が設定されてるし、設定されてる画像はこの削除されるプロダクトのものではない
    if (collectionImageUrl && collectionImageUrl !== collectionProductImageUrl) {
      functions.logger.info('collection already has imageUrl, which is different from the product\'s one', {
        collection,
        collectionProduct,
        context,
      });
      return;
    }

    const productQuerySnapshot = await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('collection_products')
      .where('collectionId', '==', collectionId)
      .where('productImageUrl', '!=', null)
      .limit(1)
      .get();
    if (productQuerySnapshot.empty) {
      functions.logger.info('product belonging to the collection not found', {
        collection,
        collectionProduct,
        context,
      });
      await collectionDoc.update({
        imageUrl: null,
      });
      return;
    }
    functions.logger.info(`updating collection's imageUrl`, {
      collection,
      collectionProduct,
      context,
    });
    await collectionDoc.update({
      imageUrl: productQuerySnapshot.docs[0].data()['productImageUrl'],
    });
  });
