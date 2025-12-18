import { ObjectId } from "mongodb";
import { getCollection } from "../lib/mongo.js";
import { createShipment, createTransaction } from "../lib/shippo.js";
import { sendBrevoEmail } from "../lib/brevo.js";

export default async function handler(req, res) {
  const collection = await getCollection();
  const now = new Date();

  /* =================================================
     CREATE SHIPMENT (LIKE LARAVEL)
  ================================================= */
  if (req.method === "POST" && req.query.action === "create") {
    try {
      const { address_from, parcels, item_details, email } = req.body;

      if (!address_from || !parcels || !email) {
        return res.status(400).json({ error: "Invalid payload" });
      }

      const address_to = {
        name: "Mr. Goods",
        street1: "965 Mission St",
        city: "San Francisco",
        state: "CA",
        zip: "94105",
        country: "US",
        email: "admin@company.com",
      };

      /* ---------- SHIPPO SHIPMENT ---------- */
      const shipment = await createShipment({
        address_from,
        address_to,
        parcels,
        async: false,
      });

      if (!shipment || shipment.status !== "SUCCESS") {
        return res.status(422).json({
          error: "Shipment creation failed",
        });
      }

      /* ---------- FILTER USPS GROUND ADVANTAGE ---------- */
      const selectedRate =
        shipment.rates?.find(
          (rate) =>
            rate?.servicelevel?.extended_token ===
            "usps_ground_advantage"
        ) || null;

      if (!selectedRate) {
        return res.status(422).json({
          error:
            "USPS Ground Advantage rate not available for this shipment",
        });
      }

      /* ---------- STORE SAME AS LARAVEL ---------- */
      const doc = {
        request: {
          address_from,
          address_to,
          parcels,
        },

        object_id: shipment.object_id || null,
        object_owner: shipment.object_owner || null,

        address_from: shipment.address_from || null,
        email: shipment.address_from?.email || email,

        parcels: shipment.parcels || null,
        shipment_date: shipment.shipment_date || null,
        address_return: shipment.address_return || null,

        rates: selectedRate || null,
        rates_object_id: selectedRate.object_id || null,
        rates_object_owner: selectedRate.object_owner || null,
        shipment: selectedRate.shipment || null,

        amount: selectedRate.amount || null,
        amount_local: selectedRate.amount_local || null,
        carrier_account: selectedRate.carrier_account || null,

        /* EMPTY FIELDS (UPDATED LATER) */
        label_response: null,
        label_url: null,
        transactions_request: null,
        rate: selectedRate.object_id || null,
        tracking_number: null,
        tracking_url_provider: null,
        parcel: selectedRate.parcel || null,

        item_details: item_details || null,
        item_image: null,

        created_at: now,
        updated_at: now,
      };

      const saved = await collection.insertOne(doc);

      /* ---------- EMAIL (CONFIRMATION) ---------- */
      await sendBrevoEmail(
        email,
        "Shipment Request Received",
        `
        <p>Thanks, ${address_from.name}!</p>
        <p>We’ve received your request.</p>
        <p>Our team will review it and email your shipping label shortly.</p>
        <p><strong>Mr. Goods</strong><br/>Customer Care Team</p>
        `
      );

      return res.json({
        status: "success",
        message: "Shipment created successfully",
        rate_object_id: selectedRate.object_id,
        id: saved.insertedId,
      });
    } catch (err) {
      console.error("CREATE ERROR:", err.response?.data || err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  /* =================================================
     GENERATE LABEL (LIKE LARAVEL)
  ================================================= */
  if (req.method === "POST" && req.query.action === "label") {
    try {
      const { id } = req.body;

      const shipment = await collection.findOne({
        _id: new ObjectId(id),
      });

      if (!shipment || !shipment.rates_object_id) {
        return res.status(404).json({
          error: "Shipment or rate_id not found",
        });
      }

      /* ---------- SHIPPO TRANSACTION ---------- */
      const transaction = await createTransaction(
        shipment.rates_object_id
      );

      if (transaction.status !== "SUCCESS") {
        return res.status(500).json({
          error: "Label generation failed",
        });
      }

      /* ---------- UPDATE SAME AS LARAVEL ---------- */
      await collection.updateOne(
        { _id: shipment._id },
        {
          $set: {
            label_response: transaction,
            label_url: transaction.label_url || null,
            transactions_request: {
              rate: shipment.rates_object_id,
              async: false,
            },
            rate: transaction.rate || shipment.rates_object_id,
            tracking_number: transaction.tracking_number || null,
            tracking_url_provider:
              transaction.tracking_url_provider || null,
            parcel: transaction.parcel || null,
            updated_at: new Date(),
          },
        }
      );

      /* ---------- EMAIL (LABEL) ---------- */
      await sendBrevoEmail(
        shipment.email,
        "Label Generated Successfully",
        `
        <p>Hi ${shipment.address_from?.name || ""},</p>
        <p>Your shipping label is ready.</p>

        <p>
          <a href="${transaction.label_url}" target="_blank">
            📎 Download Shipping Label
          </a>
        </p>

        <p>
          <a href="${transaction.tracking_url_provider}" target="_blank">
            🔗 Track Your Shipment
          </a>
        </p>

        <p><strong>Mr. Goods</strong><br/>Customer Care Team</p>
        `
      );

      return res.json({
        status: "success",
        message: "Label generated successfully",
      });
    } catch (err) {
      console.error("LABEL ERROR:", err.response?.data || err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  /* =================================================
     ADMIN LIST
  ================================================= */
  if (req.method === "GET") {
    const list = await collection
      .find()
      .sort({ created_at: -1 })
      .toArray();

    return res.json(list);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
