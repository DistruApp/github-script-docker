import {Octokit as Core} from '@octokit/core';
import {restEndpointMethods} from '@octokit/plugin-rest-endpoint-methods';
import {paginateRest} from '@octokit/plugin-paginate-rest';
import {createAppAuth} from '@octokit/auth-app';
import {readFileSync, existsSync} from 'fs';

if (!existsSync(process.env.GITHUB_EVENT_PATH)) {
    const path = process.env.GITHUB_EVENT_PATH;
    throw new Error(`Invalid GITHUB_EVENT_PATH value: '${path}' does not exist`);
}

if (!existsSync(process.env.GITHUB_APP_PRIVATE_KEY)) {
    const path = process.env.GITHUB_APP_PRIVATE_KEY;
    throw new Error(`Expected valid path in GITHUB_APP_PRIVATE_KEY: does not exist`);
}

const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, {encoding: 'utf8'}));
const privateKey = readFileSync(process.env.GITHUB_APP_PRIVATE_KEY);

const event = {
  payload,
  eventName: process.env.GITHUB_EVENT_NAME,
  action: payload.action,
  sha: null,
  ref: null,
  owner: null,
  repo: null,
  pull_request: null,
};

// Fill out repository metadata
if (typeof event.payload.repository === 'object') {
  const [owner, repo] = event.payload.repository.full_name.split('/');
  event.owner = owner;
  event.repo = repo;
}

// Fill out common sha/ref metadata, where available
switch (event.eventName) {
    case 'push':
      event.sha = event.payload.after;
      event.ref = event.payload.ref.replace('refs/heads/', '');
      break;
    case 'pull_request':
      event.pull_request = {
        number: event.payload.number,
        head_ref: event.payload.pull_request.head.ref,
        head_sha: event.payload.pull_request.head.sha,
        base_ref: event.payload.pull_request.base.ref,
      };
      event.sha = event.payload.pull_request.head.sha;
      event.ref = event.payload.pull_request.head.ref;
      break;
    case 'check_run':
      event.sha = event.payload.check_run.check_suite.head_sha;
      event.ref = event.payload.check_run.check_suite.head_branch;
      break;
    case 'deployment':
    case 'deployment_status':
      event.sha = event.payload.deployment.sha;
      event.ref = event.payload.deployment.ref;
      break;
    case 'repository_dispatch':
      event.sha = event.payload.client_payload.sha || null;
      event.ref = event.payload.branch;
      break;
    case 'workflow_dispatch':
      event.ref = event.payload.ref;
      break;
    default:
      break;
}

export const Octokit = Core.plugin(
  restEndpointMethods,
  paginateRest
).defaults({
    authStrategy: createAppAuth,
    auth: {
        privateKey,
        type: 'installation',
        appId: process.env.GITHUB_APP_ID,
        installationId: process.env.GITHUB_APP_INSTALL_ID,
        clientId: process.env.GITHUB_APP_CLIENT_ID,
        clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
    },
    previews: ['ant-man-preview', 'flash-preview'],
});

export const context = event;
