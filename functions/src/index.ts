import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {CallableContext} from "firebase-functions/lib/providers/https";
import {LogEntry} from "firebase-functions/lib/logger";
import axios from 'axios';

const metascraper = require('metascraper')([
  require('metascraper-amazon')(),
  require('metascraper-youtube')(),
  require('metascraper-author')(),
  require('metascraper-date')(),
  require('metascraper-description')(),
  require('metascraper-image')(),
  require('metascraper-logo')(),
  require('metascraper-clearbit')(),
  require('metascraper-publisher')(),
  require('metascraper-title')(),
  require('metascraper-url')(),
  require('metascraper-video')(),
  require('metascraper-lang')(),
]);


admin.initializeApp();

export const fetchUrlMetadata = functions.region('asia-northeast1').https.onCall(async (data, context: CallableContext) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called while authenticated.');
  }
	const { url } = data;
  if (!(typeof url === 'string') || url.length === 0) {
		throw new functions.https.HttpsError('invalid-argument', 'The function must be called with one arguments "url".');
	}
  let body = null;
  try {
    const response = await axios.get(url);
    body = response.data;
  } catch (e) {
    functions.logger.error(e.message, {
      url,
    });
    return null;
  }

  try {
    const metadata = await metascraper({
      html: body,
      url: url,
    });
    functions.logger.info('metadata', {
      url,
      metadata,
    });
    return metadata;
  } catch (e) {
    functions.logger.error(e.message, {
      url,
    });
    return null;
  }
});

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
