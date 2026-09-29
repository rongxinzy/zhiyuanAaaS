// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ModelConnectionSelect } from "./ModelConnectionSelect.js";
import { administratorIdentity } from "./test-fixtures.js";
afterEach(cleanup);
const credentials = [
  {
    id: "server-1",
    name: "Gateway",
    service: "openai",
    deliveryMode: "server_only",
    enabled: true,
    value: "must-never-render",
  },
  {
    id: "client-1",
    name: "Client key",
    service: "openai",
    deliveryMode: "client",
    enabled: true,
  },
  {
    id: "disabled-1",
    name: "Disabled key",
    service: "openai",
    deliveryMode: "server_only",
    enabled: false,
  },
];
test("selects enabled server credentials by metadata without exposing values", async () => {
  const client = { credentials: vi.fn().mockResolvedValue({ credentials }) };
  const change = vi.fn();
  render(
    <ModelConnectionSelect
      client={client as never}
      identity={administratorIdentity}
      onChange={change}
    />,
  );
  await waitFor(() => expect(screen.getByRole("combobox")).not.toBeDisabled());
  fireEvent.mouseDown(screen.getByRole("combobox"));
  fireEvent.click(await screen.findByText("Gateway · openai"));
  expect(change).toHaveBeenCalledWith("server-1");
  expect(screen.queryByText("Client key · openai")).not.toBeInTheDocument();
  expect(screen.queryByText("Disabled key · openai")).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain("must-never-render");
});
test("does not request credential metadata without read permission", () => {
  const client = { credentials: vi.fn() };
  render(
    <ModelConnectionSelect
      client={client as never}
      identity={{
        ...administratorIdentity,
        roles: [],
        permissions: ["models.write"],
      }}
      value="existing-reference"
    />,
  );
  expect(client.credentials).not.toHaveBeenCalled();
  expect(screen.getByText("existing-reference")).toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});
test("retains current reference on lookup failure and supports retry", async () => {
  const client = {
    credentials: vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ credentials }),
  };
  const change = vi.fn();
  render(
    <ModelConnectionSelect
      client={client as never}
      identity={administratorIdentity}
      value="server-1"
      onChange={change}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("暂无法获取");
  fireEvent.click(screen.getByRole("button", { name: /重.*试/ }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  expect(client.credentials).toHaveBeenCalledTimes(2);
  expect(change).not.toHaveBeenCalled();
});
