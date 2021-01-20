const assert = require('assert');

console.log(`event: ${context.eventName}, action: ${context.action}`);
console.log(`owner: ${context.owner}, repo: ${context.repo}`);
console.log(`sha: ${context.sha}`);
console.log(`ref: ${context.ref}`);

const response = await github.repos.listDeployments({
    owner: 'distruapp',
    repo: 'distru',
    per_page: 2,
    page: 1
});

process.stdout.write(JSON.stringify(response));

assert(response.status == '200', 'expected 200 OK response');

