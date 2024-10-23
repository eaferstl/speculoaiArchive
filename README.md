# Firestore Archival Script

This repository contains two scripts for archiving documents in a Firestore Database:
- From a **Contacts** collection in Firestore to an **archive_Contacts** collection based on a specified `organization_id`. The script supports both **live runs** and **dry runs** to help ensure data integrity during the archival process.
- From an **Organization** collection in Firestore to an **archive_Organization** collection based on a specified `organization_id`. The script supports both **live runs** and **dry runs** to help ensure data integrity during the archival process.

## Table of Contents
- [Project Overview](#project-overview)
- [Features](#features)
- [Setup](#setup)
- [Usage](#usage)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [License](#license)

## Project Overview
The goal of this project is to allow organizations to easily archive old or unused documents from a primary Firestore collection to a separate archive collection. This helps in maintaining the size and performance of the live collection.

## Features
- Archives documents based on a given `organization_id`.
- Supports dry runs to allow verification before committing changes.
- Batch processing to comply with Firestore operation limits.
- Logs actions and errors for auditing purposes.

## Setup
- Download any necessary packages to run the necessary code such as node

## Usage
- To run the Contacts script, use the following command: node archiveContactsFromOrg.js --org=organization-id
- To perform a dry run (test mode) for the Contacts script, add the --dryRun flag as follows: node archiveContactsFromOrg.js --org=organization-id --dryRun
- To run the Organization script, first run the Contacts script and then use the following command: node archiveOrganization.js --org=organization-id
- To perform a dry run (test mode) for the Organization script, add the --dryRun flag as follows: node archiveOrganization.js -- org=organization-id --dryRun

### Prerequisites
- **Node.js**: Ensure Node.js and npm are installed on your system.
- **Firebase Admin SDK**: This script uses Firebase Admin SDK to connect to Firestore.
- **Service Account Keys**: Obtain and securely store the service account keys for both your primary and archive Firestore databases.
- **service.log**: Optional ability to obtain service log from others local repos if required

### Installation
1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/firestore-archival-script.git
   cd firestore-archival-script
