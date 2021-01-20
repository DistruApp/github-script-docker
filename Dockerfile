FROM debian:10-slim

WORKDIR /opt/app
ENV PATH=/opt/node/bin:${PATH} \
    NODE_PATH=/opt/node/lib/node_modules/ \
    NODE_VERSION=v14.15.4

RUN \
  apt update && \
  apt install -y curl && \
  curl -sSLO https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.gz && \
  tar -xzf node-${NODE_VERSION}-linux-x64.tar.gz && \
  rm node-${NODE_VERSION}-linux-x64.tar.gz && \
  mv node-${NODE_VERSION}-linux-x64 /opt/node

ADD modules /opt/app/modules
ADD src /opt/app/src
ADD package.json /opt/app

RUN npm install -g

WORKDIR /opt/app

CMD ["bash"]
