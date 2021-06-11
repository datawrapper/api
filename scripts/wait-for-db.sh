#!/bin/sh
curl --retry 5 --retry-connrefused mysql:3306 > /dev/null
