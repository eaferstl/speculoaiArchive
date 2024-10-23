// archiveData.js

const admin = require('firebase-admin');
const path = require('path');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const winston = require('winston');

// ----------------------
// 1. Configure Logging
// ----------------------

// Initialize Winston logger
const logger = winston.createLogger({
  level: 'info', // Adjust the logging level as needed
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(
      ({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'archive.log' }), // Logs will be saved to archive.log
  ],
});

// ----------------------
// 2. Parse Command-Line Arguments
// ----------------------

// Use yargs to parse command-line arguments
const argv = yargs(hideBin(process.argv))
  .option('org', {
    alias: 'o',
    description: 'Organization ID to filter documents',
    type: 'string',
    demandOption: true, // Makes this argument required
  })
  .option('dryRun', {
    alias: 'd',
    description: 'Run the script without performing any write/delete operations',
    type: 'boolean',
    demandOption: false,
  })
  .help()
  .alias('help', 'h')
  .argv;

// ----------------------
// 3. Initialize Firestore Instances
// ----------------------

// Paths to your service account keys
const defaultServiceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
const archiveServiceAccountPath = path.join(__dirname, 'archiveServiceAccountKey.json');

// Require the service account JSON files
const defaultServiceAccount = require(defaultServiceAccountPath);
const archiveServiceAccount = require(archiveServiceAccountPath);

// Verify that service accounts have project_id
if (!defaultServiceAccount.project_id) {
  logger.error('Default service account JSON is missing "project_id".');
  process.exit(1);
}

if (!archiveServiceAccount.project_id) {
  logger.error('Archive service account JSON is missing "project_id".');
  process.exit(1);
}

// Initialize the main Firestore app (default project)
const mainApp = admin.initializeApp(
  {
    credential: admin.credential.cert(defaultServiceAccount),
    projectId: defaultServiceAccount.project_id,
  },
  'main' // Named 'main' to distinguish from other app instances
);

// Initialize the archive Firestore app (archive project)
const archiveApp = admin.initializeApp(
  {
    credential: admin.credential.cert(archiveServiceAccount),
    projectId: archiveServiceAccount.project_id,
  },
  'archive' // Named 'archive' to distinguish from 'main'
);

// References to Firestore databases
const mainFirestore = mainApp.firestore();
const archiveFirestore = archiveApp.firestore();

// ----------------------
// 4. Define Helper Functions
// ----------------------

// Function to verify Firestore project connections
async function verifyProjects() {
  try {
    const mainProject = mainApp.options.projectId;
    const archiveProject = archiveApp.options.projectId;
    logger.info(`Main Project ID: ${mainProject}`);
    logger.info(`Archive Project ID: ${archiveProject}`);
  } catch (error) {
    logger.error('Error verifying project IDs:', error);
  }
}

// Function to test fetch documents
async function testFetchDocuments({
  liveCollection,
  organizationId,
}) {
  try {
    logger.info(
      `Testing fetch for organization_id '${organizationId}' from '${liveCollection}' collection...`
    );

    const liveRef = mainFirestore.collection(liveCollection);
    const querySnapshot = await liveRef.where('organization_id', '==', organizationId).get();

    if (querySnapshot.empty) {
      logger.info('No documents found for testing.');
      return false;
    }

    logger.info(`Found ${querySnapshot.size} documents for testing.`);
    querySnapshot.docs.slice(0, 5).forEach(doc => {
      logger.info(`Document ID: ${doc.id}, organization_id: ${doc.data().organization_id}`);
    });

    return true;
  } catch (error) {
    logger.error('Error during test fetch:', error);
    return false;
  }
}

// ----------------------
// 5. Define the Archival Function
// ----------------------

/**
 * Archives documents from the 'Contacts' collection based on organization_id.
 * @param {Object} options - Configuration options.
 * @param {string} options.liveCollection - Name of the live collection ('Organizations').
 * @param {string} options.archiveCollection - Name of the archive collection (e.g., 'archive_Organizations').
 * @param {string} options.organizationId - The organization_id to filter documents.
 * @param {number} [options.batchSize=500] - Number of operations per batch.
 * @param {boolean} [options.isDryRun=false] - Whether to perform a dry run.
 */
async function archiveContactsDocuments({
  liveCollection,
  archiveCollection,
  organizationId,
  batchSize = 500,
  isDryRun = false,
}) {
  try {
    logger.info(
      `Starting archival process for organization_id '${organizationId}' from '${liveCollection}' to '${archiveCollection}'...`
    );

    // Reference to the live 'Contacts' collection
    const liveRef = mainFirestore.collection(liveCollection);

    // Query to fetch documents matching the organization_id
    const querySnapshot = await liveRef.where('organization_id', '==', organizationId).get();

    if (querySnapshot.empty) {
      logger.info('No documents match the archival criteria.');
      return;
    }

    logger.info(`Found ${querySnapshot.size} documents to archive.`);

    // Log the first few documents for verification
    querySnapshot.docs.slice(0, 5).forEach(doc => {
      logger.info(`Document ID: ${doc.id}, organization_id: ${doc.data().organization_id}`);
    });

    // Initialize batch operations
    let batch = mainFirestore.batch();
    let archiveBatch = archiveFirestore.batch();
    let operations = 0;

    for (const doc of querySnapshot.docs) {
      const docData = doc.data();

      // Reference to the archive document in the archive Firestore
      const archiveDocRef = archiveFirestore.collection(archiveCollection).doc(doc.id);

      if (!isDryRun) {
        // Add set operation to archive batch
        archiveBatch.set(archiveDocRef, docData);

        // Add delete operation to live batch
        batch.delete(liveRef.doc(doc.id));
      } else {
        logger.info(`Dry Run: Would archive and delete Document ID: ${doc.id}`);
      }

      operations++;

      // Commit batches if batch size limit is reached
      if (operations === batchSize) {
        if (!isDryRun) {
          await archiveBatch.commit();
          await batch.commit();
          logger.info(`Archived and deleted ${operations} documents.`);
        } else {
          logger.info(`Dry Run: Would archive and delete ${operations} documents.`);
        }

        // Reset batches and operations count
        batch = mainFirestore.batch();
        archiveBatch = archiveFirestore.batch();
        operations = 0;
      }
    }

    // Commit any remaining operations
    if (operations > 0) {
      if (!isDryRun) {
        await archiveBatch.commit();
        await batch.commit();
        logger.info(`Archived and deleted the last ${operations} documents.`);
      } else {
        logger.info(`Dry Run: Would archive and delete the last ${operations} documents.`);
      }
    }

    logger.info('Archival process completed successfully.');
  } catch (error) {
    logger.error('Error during archival process:', error);
  }
}

// ----------------------
// 6. Main Execution Function
// ----------------------

async function main() {
  const ORGANIZATION_ID = argv.org;
  const LIVE_COLLECTION = 'Organizations';
  const ARCHIVE_COLLECTION = 'archive_Organizations';
  const isDryRun = argv.dryRun;

  // Verify Firestore project connections
  await verifyProjects();

  // Test fetch documents
  const hasDocuments = await testFetchDocuments({
    liveCollection: LIVE_COLLECTION,
    organizationId: ORGANIZATION_ID,
  });

  if (!hasDocuments) {
    logger.info('No documents found. Exiting archival process.');
    return;
  }

  if (isDryRun) {
    logger.info('Dry run mode enabled. No documents will be archived or deleted.');
  }

  // Proceed with archival
  await archiveContactsDocuments({
    liveCollection: LIVE_COLLECTION,
    archiveCollection: ARCHIVE_COLLECTION,
    organizationId: ORGANIZATION_ID,
    batchSize: 500,
    isDryRun: isDryRun,
  });
}

// Execute the main function
main();
