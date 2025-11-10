import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { studentTokens, moverTokens } from './tokens.js';

const errorRate = new Rate('errors');
const postOrderLatency = new Trend('post_order_latency');
const getAvailableJobsLatency = new Trend('get_available_jobs_latency');

// test config
export const options = {
  stages: [
    // gradually increase load over 2 minutes
    { duration: '1m', target: 200 }, // ramp to 200 users in 1 minute
    { duration: '1m', target: 400 }, // Ramp to 400 users in another minute
    { duration: '3m', target: 400 }, // hold at 400 users for 3 minutes
    // gradually decrease load over 2 minutes
    { duration: '1m', target: 200 }, // down to 200 users
    { duration: '1m', target: 0 }, // down to 0 users
  ],
  thresholds: {
    // 90th percentile latency must be below 800ms for each endpoint
    'http_req_duration{name:POST /api/order}': ['p(90)<800'],
    'http_req_duration{name:GET /api/jobs/available}': ['p(90)<800'],
    // overall error rate must be below 1%
    errors: ['rate<0.01'],
    // HTTP errors should be less than 1%
    'http_req_failed': ['rate<0.01'],
    // check if 95% of requests complete within 800ms
    'http_req_duration': ['p(90)<800'],
  },
};


// const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const BASE_URL = 'http://localhost:3000';


const WAREHOUSES = [
  {
    lat: 49.2827,
    lon: -123.1207,
    formattedAddress: '2457 Kingsway, Vancouver, BC',
  },
  {
    lat: 49.25,
    lon: -123.1,
    formattedAddress: '456 West St, Vancouver, BC',
  },
];

function generateObjectId() {
  const timestamp = Math.floor(new Date().getTime() / 1000).toString(16);
  const objectId =
    timestamp +
    'xxxxxxxxxxxxxxxx'
      .replace(/[x]/g, () => {
        return Math.floor(Math.random() * 16).toString(16);
      })
      .toLowerCase();
  return objectId.padEnd(24, '0');
}

function generateAddress() {
  const baseLat = 49.2827;
  const baseLon = -123.1207;

  return {
    lat: baseLat + (Math.random() - 0.5) * 0.1, 
    lon: baseLon + (Math.random() - 0.5) * 0.1,
    formattedAddress: `${Math.floor(Math.random() * 1000)} Test Street, Vancouver, BC`,
  };
}

function getRandomWarehouse() {
  return WAREHOUSES[Math.floor(Math.random() * WAREHOUSES.length)];
}

function getRandomStudentToken() {
  return studentTokens[Math.floor(Math.random() * studentTokens.length)];
}

function getRandomMoverToken() {
  return moverTokens[Math.floor(Math.random() * moverTokens.length)];
}

// generate random order data
function generateOrderData() {
  const now = new Date();
  const pickupTime = new Date(
    now.getTime() + Math.random() * 3 * 24 * 60 * 60 * 1000
  ); // Random time in next 3 days
  const returnTime = new Date(
    pickupTime.getTime() + (7 + Math.random() * 30) * 24 * 60 * 60 * 1000
  ); // 7-37 days after pickup

  const volume = Math.floor(Math.random() * 50) + 1; // 1-50 cubic feet
  const basePrice = volume * 5; // Base price calculation
  const totalPrice = basePrice + Math.floor(Math.random() * 100) + 10; // $10-$110 additional

  const studentAddress = generateAddress();
  const warehouseAddress = getRandomWarehouse();

  return {
    studentId: generateObjectId(),
    volume: volume,
    totalPrice: totalPrice,
    studentAddress: studentAddress,
    warehouseAddress: warehouseAddress,
    pickupTime: pickupTime.toISOString(),
    returnTime: returnTime.toISOString(),
    returnAddress: Math.random() > 0.5 ? generateAddress() : undefined, // 50% chance of custom return address
    paymentIntentId:
      Math.random() > 0.3 ? `pi_test_${generateObjectId()}` : undefined, // 70% chance of payment intent
  };
}

export default function () {
  const random = Math.random();

  if (random < 0.7) {
    // 70% of requests: POST /api/order
    const orderData = generateOrderData();
    const studentToken = getRandomStudentToken();
    const postResponse = http.post(
      `${BASE_URL}/api/order`,
      JSON.stringify(orderData),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        tags: { name: 'POST /api/order' },
      }
    );

    const postSuccess = check(postResponse, {
      'POST /api/order status is 201': (r) => r.status === 201,
      'POST /api/order has response body': (r) => r.body.length > 0,
      'POST /api/order returns valid order': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.id !== undefined || body._id !== undefined;
        } catch {
          return false;
        }
      },
    });

    errorRate.add(!postSuccess);
    postOrderLatency.add(postResponse.timings.duration);

    if (!postSuccess) {
      console.error(
        `POST /api/order failed: ${postResponse.status} - ${postResponse.body}`
      );
    }
  } else {
    // 30% of requests: GET /api/jobs/available
    const moverToken = getRandomMoverToken();
    const getResponse = http.get(`${BASE_URL}/api/jobs/available`, {
      headers: {
        Authorization: `Bearer ${moverToken}`,
      },
      tags: { name: 'GET /api/jobs/available' },
    });

    const getSuccess = check(getResponse, {
      'GET /api/jobs/available status is 200': (r) => r.status === 200,
      'GET /api/jobs/available has response body': (r) => r.body.length > 0,
    });

    errorRate.add(!getSuccess);
    getAvailableJobsLatency.add(getResponse.timings.duration);

    if (!getSuccess) {
      console.error(
        `GET /api/jobs/available failed: ${getResponse.status} - ${getResponse.body}`
      );
    }
  }

  // 0.5-2.5 seconds between requests to simulate user think time
  sleep(Math.random() * 2 + 0.5); 
}

// summary function to output custom metrics
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'load-test-summary.json': JSON.stringify(data, null, 2),
  };
}

// text summary
function textSummary(data, options) {
  const indent = options.indent || '  ';
  let summary = '\n' + '='.repeat(60) + '\n';
  summary += 'LOAD TEST SUMMARY - PEAK BURST TEST\n';
  summary += '='.repeat(60) + '\n\n';

  summary += 'Overall Metrics:\n';
  summary += `${indent}Total Requests: ${data.metrics.http_reqs?.values.count || 0}\n`;
  summary += `${indent}Failed Requests: ${
    data.metrics.http_req_failed?.values.rate
      ? (data.metrics.http_req_failed.values.rate * 100).toFixed(2) + '%'
      : '0%'
  }\n`;
  summary += `${indent}Average Response Time: ${
    data.metrics.http_req_duration?.values.avg
      ? data.metrics.http_req_duration.values.avg.toFixed(2) + 'ms'
      : 'N/A'
  }\n`;
  summary += `${indent}95th Percentile: ${
    data.metrics.http_req_duration?.values['p(95)']
      ? data.metrics.http_req_duration.values['p(95)'].toFixed(2) + 'ms'
      : 'N/A'
  }\n`;
  summary += `${indent}99th Percentile: ${
    data.metrics.http_req_duration?.values['p(99)']
      ? data.metrics.http_req_duration.values['p(99)'].toFixed(2) + 'ms'
      : 'N/A'
  }\n`;
  summary += `${indent}Max Response Time: ${
    data.metrics.http_req_duration?.values.max
      ? data.metrics.http_req_duration.values.max.toFixed(2) + 'ms'
      : 'N/A'
  }\n`;
  summary += `${indent}Requests per Second: ${
    data.metrics.http_reqs?.values.rate
      ? data.metrics.http_reqs.values.rate.toFixed(2)
      : 'N/A'
  }\n\n`;

  summary += 'Endpoint-Specific Metrics:\n';
  if (data.metrics['post_order_latency']) {
    const postP95 = data.metrics['post_order_latency'].values['p(95)'] || 0;
    summary += `${indent}POST /api/order - 95th percentile: ${postP95.toFixed(2)}ms ${
      postP95 < 500 ? '✓' : '✗'
    }\n`;
  }
  if (data.metrics['get_available_jobs_latency']) {
    const getP95 =
      data.metrics['get_available_jobs_latency'].values['p(95)'] || 0;
    summary += `${indent}GET /api/jobs/available - 95th percentile: ${getP95.toFixed(2)}ms ${
      getP95 < 500 ? '✓' : '✗'
    }\n`;
  }

  // threshold results
  summary += '\nThreshold Results:\n';
  if (data.metrics.errors) {
    const errorRate = data.metrics.errors.values.rate * 100;
    summary += `${indent}Error Rate: ${errorRate.toFixed(2)}% ${
      errorRate < 1 ? '✓' : '✗'
    }\n`;
  }
  if (data.metrics.http_req_duration) {
    const p95 = data.metrics.http_req_duration.values['p(95)'] || 0;
    summary += `${indent}95th Percentile Latency: ${p95.toFixed(2)}ms ${
      p95 < 500 ? '✓' : '✗'
    }\n`;
  }

  summary += '\n' + '='.repeat(60) + '\n';
  summary += 'Scalability Metrics:\n';
  summary += '='.repeat(60) + '\n';
  summary += `${indent}Peak VUs: 400\n`;
  summary += `${indent}Test Duration: ~8 minutes (ramp-up, sustained, ramp-down)\n`;
  summary += `${indent}Total Data Transferred: ${
    data.metrics.data_received?.values.count
      ? (data.metrics.data_received.values.count / 1024 / 1024).toFixed(2) +
        ' MB'
      : 'N/A'
  }\n`;
  summary += `${indent}Data Sent: ${
    data.metrics.data_sent?.values.count
      ? (data.metrics.data_sent.values.count / 1024 / 1024).toFixed(2) + ' MB'
      : 'N/A'
  }\n\n`;

  if (data.root_group && data.root_group.checks) {
    summary += 'Check Results:\n';
    Object.entries(data.root_group.checks).forEach(([name, check]) => {
      const total = check.passes + check.fails;
      const passRate = total > 0 ? (check.passes / total) * 100 : 0;
      summary += `${indent}${name}: ${passRate.toFixed(2)}% (${check.passes}/${total})\n`;
    });
  }

  summary += '\n' + '='.repeat(60) + '\n';
  return summary;
}
