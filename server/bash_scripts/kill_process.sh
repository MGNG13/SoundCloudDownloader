#!/bin/bash
# Define the ports
PORTS=(2000 80)

# Iterate over each port
for PORT in "${PORTS[@]}"; do
    # Find the PID of the process using the port
    PID=$(sudo lsof -t -i:$PORT)

    # If a process is found, kill it
    if [ -n "$PID" ]; then
        echo "Killing process on port $PORT with PID $PID"
        sudo kill -9 $PID
        echo "Process on port $PORT stopped."
    else
        echo "No process found on port $PORT"
    fi
done