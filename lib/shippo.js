import axios from "axios";

const shippo = axios.create({
  baseURL: process.env.SHIPPO_BASE_URL,
  headers: {
    Authorization: process.env.SHIPPO_TOKEN,
    "Content-Type": "application/json",
  },
});

export async function createShipment(payload) {
  const res = await shippo.post("shipments/", payload);
  return res.data;
}

export async function createTransaction(rateId) {
  const res = await shippo.post("transactions", {
    rate: rateId,
    label_file_type: "PDF_4x6",
    async: false,
  });
  return res.data;
}
