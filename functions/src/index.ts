import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {CallableContext} from "firebase-functions/lib/providers/https";
import {LogEntry} from "firebase-functions/lib/logger";

const got = require('got');
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
  try {
    const response = await got(url);
    const metadata = await metascraper({
      html: response.body,
      url: response.url,
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
  }
  return null;
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
