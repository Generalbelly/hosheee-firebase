import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {CallableContext} from "firebase-functions/lib/providers/https";

const got = require('got');
const { Logging } = require('@google-cloud/logging');
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
const logging = new Logging({
  projectId: process.env.GCLOUD_PROJECT,
});

const reportError = (err: Error, context: Object = {}): Promise<Error|void> => {
  // This is the name of the StackDriver log stream that will receive the log
  // entry. This name can be any valid log stream name, but must contain "err"
  // in order for the error to be picked up by StackDriver Error Reporting.
  const logName = 'errors';
  const log = logging.log(logName);

  // https://cloud.google.com/logging/docs/api/ref_v2beta1/rest/v2beta1/MonitoredResource
  const metadata = {
    resource: {
      type: 'cloud_function',
      labels: { function_name: process.env.FUNCTION_NAME },
    },
  };

  // https://cloud.google.com/error-reporting/reference/rest/v1beta1/ErrorEvent
  const errorEvent = {
    message: err.stack,
    serviceContext: {
      service: process.env.FUNCTION_NAME,
      resourceType: 'cloud_function',
    },
    context: context,
  };

  // Write the error log entry
  return new Promise((resolve, reject) => {
    log.write(log.entry(metadata, errorEvent), (error: Error|null) => {
      if (error) {
        reject(error);
      }
      resolve();
    });
  });
}

export const fetchMetadata = functions.region('asia-northeast1').https.onCall(async (data, context: CallableContext) => {
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
    console.log(metadata);
    return metadata;
  } catch (e) {
    await reportError(e, {
      url,
    });
  }
  return null;
});
