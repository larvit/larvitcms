FROM alpine:latest

RUN apk update && apk add \
	nodejs \
	curl \
	python \
	bash \
	alpine-sdk \
	git \
	mariadb mariadb-client

WORKDIR /srv

COPY ./app/* /srv/
RUN npm i

COPY ./dockerInit.sh /root/dockerInit.sh
RUN chmod +x /root/dockerInit.sh

CMD /root/dockerInit.sh
