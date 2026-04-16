const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
/*
  Paychex automation script

  Purpose
  - Read a CSV file of employee/direct-deposit rows (dd.csv) and post direct-deposit
    updates to the Paychex API for matching workers.

  Important notes / assumptions
  - This file is the original automation script. It contains several areas that
    need hardening before production (see README.md). This file preserves the
    author's original control flow and should be refactored for robustness.
  - The script expects a local file `dd.csv` in the same directory. Each row is
    treated as one employee record. The parsing is naive (split on newlines) and
    does not handle CSV quoting or commas in fields.
  - Authentication (OAuth) call is made to the token URL below; client
    credentials are expected to be inserted where indicated or provided by
    environment/secret management in a refactor.

  CSV format (expected fields, example header):
    firstName,lastName,workerId,startDate,paymentType,accountType,value,routingNumber,accountNumber,priority

  Integration: Power Automate / OneDrive
  - Use a Power Automate flow with trigger "When a file is created" (OneDrive for Business),
    then either:
      * Send the file contents to a hosted endpoint that runs this script, or
      * Drop the file into a location where this script runs and is scheduled to poll.

  See README.md for detailed usage, risks, and recommended refactors.

*/

const apiURL = new url.URL('https://api.paychex.com/auth/oauth/v2/token');
async function getAccessToken(url) {
  try {
    // NOTE: original code wrapped async/await in an extra Promise. It returns
    // the token response JSON. In practice, you should use URLSearchParams to
    // encode x-www-form-urlencoded body and supply client credentials from
    // environment variables or a secure store instead of inlining here.
    return new Promise(async (resolve, reject) => { 
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: JSON.stringify([{ 
            grant_type: process.env.GRANT_TYPE,
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            scope: process.env.SCOPE
          }])
      });
      if(response) {
        resolve(response.json());
      }
      else {
        reject('Error retrieving access token', response);
      }
    });
  }
  catch(e) {
    console.log('Error connecting to Paychex API:', e);
  }
}
async function getCompanyId(accessToken) {
  try {
    return new Promise(async (resolve, reject) => {
      const companyId = await fetch('https://api.paychex.com/companies', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.paychex.companies.v1+json'
          }
        });
      const cid = await companyId.json().then(data => data[0].id);
      if(cid)  {
        resolve(cid);
      }
      else {
        reject('Error retrieving company ID', companyId);
      }
    });   
  }
  catch(e) {
    console.log('Error retrieving company ID:', e);
  }
}
async function getWorkers(cid, accessToken) {
  try {
    return new Promise(async (resolve, reject) => { 
      const workers = await fetch(`https://api.paychex.com/companies/${cid}/workers`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'     
        }
      });
      // `workers` is the fetch Response object. The original script resolves
      // with the response; callers must call .json() on it. Consider returning
      // the parsed JSON directly to simplify callers.
      if(workers) {
        resolve(workers.json());
      }
      else {
        reject('Error retrieving workers', workers);
      }
    });
  }
  catch(e) {
    console.log('Error retrieving workers:', e);
  }
}
// async function sendCompanyJob(employee) {
//   try {
//     return new Promise(async (resolve, reject) => {
//       const companyJobResponse = await fetch(`https://api.paychex.com/workers/${employee.workerId}/companyjobs`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/x-www-form-urlencoded',
//         },
//         body: JSON.stringify([{
//           jobsCorrelationId: employee.jobsCorrelationId,
//           jobName: employee.jobName,
//           startDate: employee.startDate,
//           endDate: employee.endDate
//         }])
//       });
//       if(companyJobResponse) {
//         resolve(companyJobResponse.json());
//       }
//       else {
//         reject('Error retrieving access token', companyJobResponse);  
//       }
//     });
//   }
//   catch(e) {

//   }
// }
async function sendWorkerPayRate(employee, accessToken) {
  try {
    return new Promise(async (resolve, reject) => {
      const workerPayRateResponse = await fetch(`https://api.paychex.com/workers/${employee.workerId}/compensation/payrates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: JSON.stringify([{
          "startDate": employee.startDate,
          "rateType": employee.rateType,
          "amount": employee.amount
        }])
      });
      if(workerPayRateResponse) {
        resolve(workerPayRateResponse.json());
      }
      else {
        reject('Error retrieving access token', workerPayRateResponse);
      }
    });
  }
  catch(e) {
    console.log('Error sending worker pay rate', e);
  }
}
async function sendWorkerDocument(employee, accessToken, file) {
  const base64 = Buffer.from(file.data).toString('base64');
  try {
    return new Promise(async (resolve, reject) => {
      const workerDocumentResponse = await fetch(`https://api.paychex.com/workers/${employee.workerId}/workerdocuments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`, 
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: JSON.stringify([{
          workerId: employee.workerId,
          file: base64,
          metadata: {
            "name": file.name,
            "category": file.category
          }
        }])
      });
      if(workerDocumentResponse) {
        resolve(workerDocumentResponse.json());
      }
      else {
        reject('Error retrieving access token', workerDocumentResponse);
      }
    });
  }
  catch(e) {
    console.log('Error sending worker document', e);
  }
}
async function sendDirectDeposit(employee, accessToken) {
  try {
    return new Promise(async (resolve, reject) => { 
    const ddResponse = await fetch(`https://api.paychex.com/workers/${employee.workerId}/directdeposits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: JSON.stringify([{ 
          startDate: employee.startDate,
          paymentType: employee.paymentType,
          accountType: employee.accountType,
          value: employee.value,
          routingNumber: employee.routingNumber,
          accountNumber: employee.accountNumber,
          priority: employee.priority
        }])
      });
      if(ddResponse) {
        resolve(ddResponse.json());
      }
      else {
        reject('Error retrieving access token', ddResponse);
      }
    });
  }
  catch(error) {
    console.log('Error on posting direct deposit for employee:', employee.workerId, error);
  }
}
async function main() {
  // Read the dd.csv file (naive parsing) and produce one record per line.
  // Expected header row and CSV parsing must be implemented for production use.
  const file = fs.readFileSync(path.join(__dirname, 'dd.csv'), 'utf-8');
  const employees = file.split('\n').map(name => name.trim()).filter(Boolean);
  // NOTE: `employees` is currently an array of strings. The original script
  // assumes structured objects; to use this reliably you should parse CSV into
  // objects keyed by header names.

  // The following block intended to match workers to employees. In the
  // original script `workers` is not defined in this scope; before calling
  // this block the code must call `getAccessToken()` and `getWorkers()` and
  // parse `employees` into objects. This preserves original behavior but is
  // not yet fully wired.
  const token = await getAccessToken(apiURL);
  const cid = await getCompanyId(token.access_token);
  const workerData = await getWorkers(cid, token.access_token);
  workerData.forEach(worker => {
    const fullName = `${worker.givenName} ${worker.familyName}`;
    employees.forEach(employee => {
      if (fullName === employee.givenName + ' ' + employee.familyName) {
        employee.workerId = worker.workerId;
      }
    });
  });
  employees.forEach(employee => {
    if (employee.workerId) {
      sendDirectDeposit(employee);
    }
  });
}

// Execute the main function
main();