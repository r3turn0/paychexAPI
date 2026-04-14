const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

// Sets up the url to access paychex API and retrieves the access token, company ID, and a list of workers and their information.
// Map the list of employee names and match it to the list of workerIds. The list of employee names is stored in a csv file.

const apiURL = new url.URL('https://api.paychex.com/auth/oauth/v2/token');
async function getAccessToken(url) {
  try {
    return new Promise(async (resolve, reject) => { 
      const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: JSON.stringify([{ 
          grant_type: '',
          client_id: '',
          client_secret: ''  
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
      if(workers) {
        resolve(workers);
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
  // Grab the files from the cloud directory in one drive under HR/Automation/Paychex/Direct Deposit
  const file = fs.readFileSync(path.join(__dirname, 'dd.csv'), 'utf-8');
  const employees = file.split('\n').map(name => name.trim());
  // Employee file must have startDate, paymentType, accountType, value, routingNumber, accountNumber, and priority. Include the workerId to post to paychex.
  // Add workerId to the employee list if the workers family name and given name match the employee first name and last name. If there is no match, add null to the list. 
  const workerData = await workers.json();
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