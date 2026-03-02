#!/bin/bash

# Lightroom Vision Service - Startup Script

cd ~/AZ-Projects/lightroom-vision-service

if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "   Run: cp .env.example .env"
    echo "   Then edit .env with your Alibaba API key"
    exit 1
fi

echo "Starting Lightroom Vision Service..."
echo ""
npm start
