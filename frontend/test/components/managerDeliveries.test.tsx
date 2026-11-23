// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ManagerDashboard } from "../../src/manager/ManagerDashboard";
import { fakeServer, manager, renderPage } from "./helpers";

const waiting = {
  orderId: "aaaaaaaa-0000-4000-8000-000000000001", customerName: "Lee Nguyen", deliveryProgress: "Awaiting dispatch",
  eta: null, totalWeight: 12.5, itemCount: 4, addressLocated: false, robotName: null, stopNumber: null,
};
const onTheWay = {
  orderId: "bbbbbbbb-0000-4000-8000-000000000002", customerName: "Mei Tanaka", deliveryProgress: "in_transit",
  eta: "2026-11-23T12:00:00Z", totalWeight: 3, itemCount: 1, addressLocated: true, robotName: "Rover 2", stopNumber: 3,
};

describe("delivery tab", () => {
  it("shows each order's weight, robot and stop", async () => {
    fakeServer({
      "GET /api/auth/me": () => ({ body: { user: manager } }),
      "GET /api/manager/deliveries": () => ({ body: { deliveries: [waiting, onTheWay] } }),
    });
    renderPage(<ManagerDashboard />, "/manager-dashboard?tab=delivery");

    const row = (await screen.findByText("Mei Tanaka")).closest("tr")!;
    expect(within(row).getByText("3 lb")).toBeInTheDocument();
    expect(within(row).getByText("1 item")).toBeInTheDocument();
    expect(within(row).getByText("Rover 2")).toBeInTheDocument();
    expect(within(row).getByText("Stop 3")).toBeInTheDocument();
    expect(within(row).getByText("in transit")).toBeInTheDocument();

    const waitingRow = screen.getByText("Lee Nguyen").closest("tr")!;
    expect(within(waitingRow).getByText("12.5 lb")).toBeInTheDocument();
    expect(within(waitingRow).getByRole("note")).toHaveTextContent("Address not on the map yet");
  });

  it("says why dispatch left an order behind", async () => {
    fakeServer({
      "GET /api/auth/me": () => ({ body: { user: manager } }),
      "GET /api/manager/deliveries": () => ({ body: { deliveries: [waiting] } }),
      "POST /api/manager/deliveries/dispatch": () => ({
        body: { runs: [], pendingOrderIds: [], unresolvedAddressOrderIds: [waiting.orderId], outOfRangeOrderIds: [], overCapacityOrderIds: [], unavailableRobotIds: [] },
      }),
    });
    const user = userEvent.setup();
    renderPage(<ManagerDashboard />, "/manager-dashboard?tab=delivery");

    await user.click(await screen.findByRole("button", { name: "Dispatch paid orders" }));

    const row = screen.getByText("Lee Nguyen").closest("tr")!;
    expect(await within(row).findByText(/Address couldn't be found on the map/)).toBeInTheDocument();
  });
});
