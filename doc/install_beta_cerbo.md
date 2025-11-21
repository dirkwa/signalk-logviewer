How-to install the latest beta or dev tree (unstable) on your device?

This guide assumes you have a default install with default folders.
This is written for a Victron Cerbo GX jump to the section you need want to go to.
It is recommended to enable the Debug Log for this plugin in Server -> Plugin Config before updating.


# Pre-requirements
On the Cerbo GUI enable SSH access and set a afmin password
Windows User: Download putty (for ssh) and Winscp (for secure fie copy)

## On GUI v1:
1. Click "Menu" (bottom right)
2. Settings > General
3. Set root password
4. Enable "SSH on LAN"

## On GUI v2:
1. Settings -> General
2. Set root password
3. Enable "SSH on LAN"


# Backup old data

## BEST + SLOW: Full signalk copy to local computer 
1. Connect your Cerbo with WinSCP
2. Copy the folder "/data/conf/signalk" to your local PC



# npmjs beta on Cerbo

## Install latest beta
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

## Install specific beta version f.e. 1.0.1-beta.5
1. SSH to the Cerbo:
```
cd /data/conf/signalk

# Here use the beta version you want to install
npm i @noforeignland/signalk-to-noforeignland@1.0.1-beta.5

# reset owner properly, else package belongs to root
chown -R signalk:signalk /data/conf/signalk/*

```
2. Restart Server & Check logs
```
 svc -t /service/signalk-server
```

