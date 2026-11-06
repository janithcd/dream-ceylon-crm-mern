const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const SupplierInvoice = require("../models/SupplierInvoice");
const { parseSupplierInvoiceRegisterQuery, buildSupplierInvoiceRegisterPipeline } = require("../utils/supplierInvoiceRegister");

test("supplier invoice register validates filters using Sri Lanka day bounds", () => {
    const instant = new Date("2026-11-05T18:29:59Z");
    const parsed = parseSupplierInvoiceRegisterQuery({ status: "needs-review", due: "overdue", page: "2" }, instant);
    assert.equal(parsed.value.start.toISOString(), "2026-11-04T18:30:00.000Z");
    assert.equal(parsed.value.nextWeek.toISOString(), "2026-11-11T18:30:00.000Z");
    assert.equal(parsed.value.page, 2);
    assert.equal(parseSupplierInvoiceRegisterQuery({}, new Date("2026-11-05T18:30:00Z")).value.start.toISOString(),
        "2026-11-05T18:30:00.000Z");
    for (const query of [{ page: "0" }, { page: "1001" }, { page: ["1", "2"] },
        { due: "tomorrow" }, { status: "Paid" }, { status: "voided", due: "overdue" }]) {
        assert.ok(parseSupplierInvoiceRegisterQuery(query, instant).error);
    }
    const pipeline = buildSupplierInvoiceRegisterPipeline(parsed.value);
    assert.deepEqual(pipeline[0].$project.cost, 1);
    assert.equal(pipeline[0].$project.data, undefined);
    assert.equal(pipeline[0].$project.sha256, undefined);
    const facet = pipeline.at(-1).$facet;
    assert.deepEqual(facet.items[0].$match.status.$in, ["Received", "Disputed"]);
    assert.equal(facet.items[0].$match.dueDate.$lt.toISOString(), parsed.value.start.toISOString());
    assert.equal(facet.items.at(-1).$project.costRemaining.$round[1], 2);
});

test("supplier invoice register is private, paged and exposes only safe fields", async (t) => {
    const finance = "507f1f77bcf86cd7994390c4", sales = "507f1f77bcf86cd7994390c5";
    let pipelines = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({ _id: id, name: "Staff",
        role: String(id) === finance ? "Finance" : "Sales", status: "Active", tokenVersion: 0 }) }));
    t.mock.method(SupplierInvoice, "aggregate", async (pipeline) => {
        pipelines.push(pipeline);
        return [{ items: [{ _id: "safe-invoice", supplierName: "CI Hotel", costRemaining: 125 }], count: [{ total: 1 }],
            summary: [{ needsReview: 1, overdue: 1, dueSoon: 0 }] }];
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/finance/costs/invoice-register`;
    const request = (path, id) => fetch(base + path, { headers: {
        Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } });
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await request("", sales)).status, 403);
    assert.equal((await request("?page=0", finance)).status, 400);
    assert.equal(pipelines.length, 0);
    const response = await request("?status=needs-review&due=overdue", finance);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const json = await response.json();
    assert.equal(json.items[0].supplierName, "CI Hotel");
    assert.deepEqual(json.summary, { needsReview: 1, overdue: 1, dueSoon: 0 });
    assert.equal(json.total, 1);
    assert.equal(pipelines.length, 1);
    assert.equal(pipelines[0][0].$project.data, undefined);
});
