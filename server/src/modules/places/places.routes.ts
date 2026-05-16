import { Router, type Response } from "express";
import { Buffer } from "node:buffer";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const placesRouter = Router();

type GoogleAddressComponent = { long_name: string; short_name: string; types: string[] };
type GoogleAutocompleteResponse = {
  status: string;
  error_message?: string;
  predictions?: Array<{
    place_id: string;
    description: string;
    structured_formatting?: { main_text?: string; secondary_text?: string };
  }>;
};
type GooglePlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    place_id: string;
    formatted_address?: string;
    name?: string;
    address_components?: GoogleAddressComponent[];
    geometry?: { location?: { lat: number; lng: number } };
  };
};

function component(components: GoogleAddressComponent[] = [], type: string, field: "long_name" | "short_name" = "long_name") {
  return components.find((item) => item.types.includes(type))?.[field] ?? "";
}

function requireGoogleKey(res: Response) {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    res.status(503).json({ error: "Google Maps is not configured. Add GOOGLE_MAPS_API_KEY in Render." });
    return "";
  }
  return key;
}

function normalizePlace(result: NonNullable<GooglePlaceDetailsResponse["result"]>) {
  const components = result.address_components ?? [];
  const streetNumber = component(components, "street_number");
  const route = component(components, "route");
  const subpremise = component(components, "subpremise");
  const city = component(components, "locality") || component(components, "postal_town") || component(components, "administrative_area_level_2");
  const state = component(components, "administrative_area_level_1", "short_name");
  const postalCode = component(components, "postal_code");
  const street1 = [streetNumber, route].filter(Boolean).join(" ") || result.name || result.formatted_address || "";

  return {
    placeId: result.place_id,
    formattedAddress: result.formatted_address ?? street1,
    street1,
    street2: subpremise,
    city,
    state,
    postalCode,
    latitude: result.geometry?.location?.lat,
    longitude: result.geometry?.location?.lng
  };
}

placesRouter.get("/autocomplete", requireAuth, asyncHandler(async (req, res) => {
  const input = typeof req.query.input === "string" ? req.query.input.trim() : "";
  if (input.length < 3) {
    res.json({ suggestions: [] });
    return;
  }

  const key = requireGoogleKey(res);
  if (!key) return;

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", input);
  url.searchParams.set("types", "address");
  url.searchParams.set("components", "country:us");
  url.searchParams.set("key", key);

  const response = await fetch(url);
  if (!response.ok) {
    res.status(502).json({ error: "Google Places request failed." });
    return;
  }

  const data = await response.json() as GoogleAutocompleteResponse;
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    res.status(502).json({ error: data.error_message ?? `Google Places returned ${data.status}.` });
    return;
  }

  res.json({
    suggestions: (data.predictions ?? []).map((prediction) => ({
      placeId: prediction.place_id,
      description: prediction.description,
      mainText: prediction.structured_formatting?.main_text,
      secondaryText: prediction.structured_formatting?.secondary_text
    }))
  });
}));

placesRouter.get("/details", requireAuth, asyncHandler(async (req, res) => {
  const placeId = typeof req.query.placeId === "string" ? req.query.placeId.trim() : "";
  if (!placeId) {
    res.status(400).json({ error: "placeId is required." });
    return;
  }

  const key = requireGoogleKey(res);
  if (!key) return;

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "place_id,formatted_address,name,address_component,geometry");
  url.searchParams.set("key", key);

  const response = await fetch(url);
  if (!response.ok) {
    res.status(502).json({ error: "Google Place Details request failed." });
    return;
  }

  const data = await response.json() as GooglePlaceDetailsResponse;
  if (data.status !== "OK" || !data.result) {
    res.status(502).json({ error: data.error_message ?? `Google Place Details returned ${data.status}.` });
    return;
  }

  res.json({ address: normalizePlace(data.result) });
}));

placesRouter.get("/street-view", asyncHandler(async (req, res) => {
  const lat = typeof req.query.lat === "string" ? req.query.lat.trim() : "";
  const lng = typeof req.query.lng === "string" ? req.query.lng.trim() : "";
  const requestedSize = typeof req.query.size === "string" ? req.query.size.trim() : "";
  const size = /^[0-9]{2,4}x[0-9]{2,4}$/.test(requestedSize) ? requestedSize : "640x320";

  if (!lat || !lng) {
    res.status(400).send("");
    return;
  }

  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    res.status(503).send("");
    return;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/streetview");
  url.searchParams.set("size", size);
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("fov", "80");
  url.searchParams.set("return_error_code", "true");
  url.searchParams.set("key", key);

  const response = await fetch(url);
  if (!response.ok) {
    res.status(response.status).send("");
    return;
  }

  const arrayBuffer = await response.arrayBuffer();
  res.setHeader("Content-Type", response.headers.get("content-type") ?? "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(Buffer.from(arrayBuffer));
}));
