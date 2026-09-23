import { expect, test } from "@playwright/test";

test("protected pantry and kitchen image routes reject anonymous requests", async ({
  request,
}) => {
  const pantry = await request.get("/api/pantry-items");
  expect(pantry.status()).toBe(401);

  const image = await request.post("/api/kitchen-images", {
    multipart: {},
  });
  expect(image.status()).toBe(401);
});
