import express from "express";
import fetch from "node-fetch";
import protobuf from "protobufjs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { formatDistanceToNow } from "date-fns";

// Define __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

const API_KEY = "aFnxVF9zO55k9Rh58Buh";
const STOP_NUMBER = "51";

const API_URL = "https://metrolink-gtfsrt.gbsdigital.us/feed/gtfsrt-trips";
const REALTIME = `https://gtfsapi.translink.ca/v3/gtfsrealtime?apikey=${API_KEY}`;

app.get("/proxy", async (req, res) => {
  try {
    const response = await fetch(API_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/x-google-protobuf",
        "x-api-key": API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    // Load the generic.proto file and decode the message
    protobuf.load(join(__dirname, "proto", "generic.proto"), (err, root) => {
      if (err) throw err;

      // Obtain a message type
      const TripUpdate = root.lookupType("TripUpdate");

      // Decode the buffer
      const decodedMessage = TripUpdate.decode(uint8Array);
      const object = TripUpdate.toObject(decodedMessage, {
        longs: String,
        enums: String,
        bytes: String,
        defaults: true,
        arrays: true,
        objects: true,
      });

      res.setHeader("Content-Type", "application/json");

      res.send(JSON.stringify(object, null, 2));
    });
  } catch (error) {
    console.error("Fetch error:", error);
    res.status(500).send(`Error fetching data: ${error.message}`);
  }
});

const getStopUpdates = (stopId, data) => {
  return JSON.parse(data)
    .entity.filter((entity) => entity.tripUpdate)
    .flatMap((entity) =>
      entity.tripUpdate.stopTimeUpdate
        .filter((stopTimeUpdate) => stopTimeUpdate.stopId === stopId)
        .map(
          (stopTimeUpdate) => {
            return formatDistanceToNow(
              new Date(stopTimeUpdate.departure.time * 1000),
              {
                addSuffix: true,
              }
            );
          }
          // formatDistanceToNow(date, { addSuffix: true });
          // tripId: entity.tripUpdate.trip.tripId,
          // routeId: entity.tripUpdate.trip.routeId,
          // arrival: stopTimeUpdate.arrival,
          // departure: stopTimeUpdate.departure,
          // delay: stopTimeUpdate.arrival.delay,
        )
    );
};

app.get("/realtime", async (req, res) => {
  try {
    const response = await fetch(REALTIME);

    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    const root = await protobuf.load("proto/gtfs-realtime.proto"); // Load the GTFS-Realtime .proto file
    const FeedMessage = root.lookupType("transit_realtime.FeedMessage");
    const message = FeedMessage.decode(new Uint8Array(buffer));
    const object = FeedMessage.toObject(message, {
      longs: String,
      enums: String,
      bytes: String,
    });

    res.setHeader("Content-Type", "application/json");

    const resJson = JSON.stringify(object, null, 2);

    res.send(getStopUpdates(STOP_NUMBER, resJson));

    //res.send(JSON.stringify(getStopUpdates(STOP_NUMBER, resJson)));
  } catch (error) {
    console.error("Fetch error:", error);
    res.status(500).send(`Error fetching data: ${error.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
