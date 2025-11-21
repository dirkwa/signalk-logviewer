# Install latest beta 
Make sure to look for your OS below.

## VenusOS - Cerbo GX
```
cd /data/conf/signalk/
npm i signalk-logviewer@beta

# reset owner properly, else package belongs to root
chown -R signalk:signalk /data/conf/signalk/*
```


## Restart Signalk Service
```
 svc -t /service/signalk-server
```


