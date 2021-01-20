# octokit-docker

This repository defines a container image which can be used to run arbitrary Node.js scripts
in response to GitHub events. It provides an authenticated, read-to-use Octokit instance, as
well as context populated from the GitHub event, much like how GitHub Actions work with the `github-script`
action.

## Usage

This was designed for our own use with Tekton Tasks, to allow implementing rich interactions with
GitHub based on webhooks received via a Tekton Trigger. However, the image is set up such that you
can use it in a variety of other ways as well, such as a Kubernetes Job.

Here's the general idea in terms of a Tekton example:

    apiVersion: tekton.dev/v1beta1
    kind: Task
    metadata:
      name: update-deployment-status
    spec:
      params:
        # define the various environment variables required here
        - name: DEPLOYMENT_ID
          type: string
        - name: DEPLOYMENT_STATUS
          type: string
        - name: DEPLOYMENT_DETAILS_URL
          type: string
        - name: DEPLOYMENT_URL
          type: string
      steps:
      - name: update-status
        image: <your github repo>/github-script:latest
        script: |
        #!/usr/bin/env github-script
        github.repos.createDeploymentStatus({
            owner: context.owner,
            repo: context.repo,
            deployment_id: process.env.DEPLOYMENT_ID,
            state: process.env.DEPLOYMENT_STATUS,
            log_url: process.env.DEPLOYMENT_DETAILS_URL,
            environment_url: process.env.DEPLOYMENT_URL,
        });

See the docs below on what environment variables are expected by the `github-script` executable, as well as what
context is available to scripts executed by `github-script`.

### Required Environment

When invoked, this script requires the following environment variables:

    GITHUB_APP_ID: The GitHub App id
    GITHUB_APP_INSTALL_ID: The GitHub App installation id
    GITHUB_APP_CLIENT_ID: The GitHub App client id
    GITHUB_APP_CLIENT_SECRET: The GitHub App client secret
    GITHUB_APP_PRIVATE_KEY: The GitHub App client secret
    GITHUB_EVENT_PATH: A path to a JSON file, containing the GitHub event payload
    GITHUB_EVENT_NAME: The GitHub event name, e.g. 'pull_request', this can be pulled from the `X-GitHub-Event` header of the webhook

### Running

Run `github-script [- | path]` to invoke the executable within the container (or if built outside the container).

The script will read from stdin if given no arguments, otherwise it expects a file
path as the first and only argument. If the file path is `-`, it will read from stdin.

The contents of the script read by `github-script` must be valid JavaScript, and are executed within
an async function, so the use of `async` and `await` are available to you. In addition, the following
context is bound to the script:

    # an authorized, ready-for-use Octokit instance
    # see https://github.com/octokit/plugin-rest-endpoint-methods.js/tree/master/docs for API docs
    github: Octokit

    # context for the script, provided via environment variables
    context:
      # the deserialized webhook payload, read from the path provided by GITHUB_EVENT_PATH
      payload: object
      # the GitHub event name, e.g. 'pull_request', from GITHUB_EVENT_NAME
      eventName: string
      # the GitHub event action, e.g. 'opened', from GITHUB_ACTION
      action: string
      # the SHA hash of the commit referenced by the event, from GITHUB_SHA
      sha: string
      # the ref of the commit referenced by the event, e.g 'refs/heads/develop', from GITHUB_REF
      ref: string
      # the owner of the GitHub repo the event applies to, e.g. `DistruApp`, from GITHUB_REPO
      owner: string
      # the GitHub repo the event applies to, e.g. `distru`, from GITHUB_REPO
      repo: string

    # node's `require` function
    require: function

    # a function that lets you execute an external program and stream its output to stdout
    exec: function

    # an object that provides a few helper functions for filesystem access
    io: object

## Development

If you haven't set up Docker's `buildx` tool before, run `make setup-buildx` before proceeding.

Run `make build` to build and load the image into your local Docker instance.

Run `make test` to run the `test/handler.js` script against the environment defined in `test.env`.

Run `make shell` to open a bash shell inside the image if you need to poke around.

## License

Much of this code is based on GitHub's code in `actions/github-script` and `actions-toolkit`, which is MIT-licensed.
This repo shares that license, and dual licenses our own work on top as either Apache 2.0 or MIT, depending on your
preference.
