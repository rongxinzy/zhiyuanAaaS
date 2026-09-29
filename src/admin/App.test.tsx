// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AdminConsoleClient } from "./client.js";
import { administratorIdentity } from "./test-fixtures.js";
import { AdminApp } from "./App.js";
import { PortalClient } from "./portal.js";

vi.mock("./Resources.js", () => ({
  Resources: ({ tab }: { tab: string }) => (
    <div data-testid="resource">{tab}</div>
  ),
}));
vi.mock("./Models.js", () => ({ Models: () => <div>model-content</div> }));
vi.mock("./ServiceStatus.js", () => ({
  KnowledgeView: () => <div>knowledge-content</div>,
  ServicesView: () => <div>services-content</div>,
}));
vi.mock("./DigitalEmployees.js", () => ({
  DigitalEmployees: () => <div>employee-content</div>,
}));
vi.mock("./Operations.js", () => ({
  Operations: () => <div>license-content</div>,
  SessionsView: () => <div>session-content</div>,
  CredentialsView: () => <div>credentials-content</div>,
  ConfigurationStatusView: () => <div>configuration-content</div>,
}));
vi.mock("./Identity.js", () => ({
  Identity: () => <div>mapping-content</div>,
}));

describe("Ant Design admin shell", () => {
  beforeEach(() => {
    window.location.hash = "";
    vi.spyOn(PortalClient.prototype, "listEmployees").mockResolvedValue([]);
    vi.spyOn(PortalClient.prototype, "listRequests").mockResolvedValue([]);
    localStorage.clear();
    vi.spyOn(AdminConsoleClient.prototype, "restore").mockResolvedValue({
      status: "signed-out",
    });
    vi.spyOn(AdminConsoleClient.prototype, "login").mockResolvedValue({
      status: "authenticated",
      identity: administratorIdentity,
    });
    vi.spyOn(AdminConsoleClient.prototype, "logout").mockResolvedValue();
    vi.spyOn(AdminConsoleClient.prototype, "overview").mockResolvedValue({
      users: 4,
      teams: 2,
      skills: 3,
      models: 1,
      pendingEvents: 0,
    });
    vi.spyOn(AdminConsoleClient.prototype, "searchAudit").mockResolvedValue({
      items: [],
      nextCursor: null,
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  function authenticated() {
    vi.mocked(AdminConsoleClient.prototype.restore).mockResolvedValue({
      status: "authenticated",
      identity: administratorIdentity,
    });
  }
  test("requires explicit enterprise credentials and submits them", async () => {
    render(<AdminApp />);
    const deployment = await screen.findByLabelText("部署 ID");
    expect(deployment).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await screen.findAllByText("请填写企业 ID、用户名和密码。");
    expect(AdminConsoleClient.prototype.login).not.toHaveBeenCalled();
    fireEvent.change(deployment, { target: { value: " enterprise-a " } });
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: " alice " },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "test-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() =>
      expect(AdminConsoleClient.prototype.login).toHaveBeenCalledWith({
        deploymentId: "enterprise-a",
        username: "alice",
        password: "test-password",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "概览" }),
    ).toBeInTheDocument();
  });
  test("shows a recoverable login error", async () => {
    vi.mocked(AdminConsoleClient.prototype.login).mockRejectedValue(
      new Error("denied"),
    );
    render(<AdminApp />);
    fireEvent.change(await screen.findByLabelText("部署 ID"), {
      target: { value: "demo" },
    });
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).not.toBeDisabled();
  });
  test("renders seven business entries without legacy navigation", async () => {
    authenticated();
    render(<AdminApp />);
    await screen.findByRole("heading", { name: "概览" });
    expect(screen.getAllByRole("menuitem")).toHaveLength(7);
    for (const name of [
      "概览",
      "数字员工",
      "知识库",
      "技能管理",
      "用户管理",
      "日志审计",
      "系统管理",
    ])
      expect(screen.getByRole("menuitem", { name })).toBeInTheDocument();
    for (const name of ["资源管理", "身份对齐", "平台运维", "数据平面"])
      expect(screen.queryByRole("menuitem", { name })).not.toBeInTheDocument();
  });
  test("hides unauthorized entries and rejects direct navigation", async () => {
    vi.mocked(AdminConsoleClient.prototype.restore).mockResolvedValue({
      status: "authenticated",
      identity: {
        ...administratorIdentity,
        roles: [],
        permissions: ["models.read"],
      },
    });
    render(<AdminApp />);
    expect(
      await screen.findByRole("menuitem", { name: "系统管理" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "用户管理" }),
    ).not.toBeInTheDocument();
    await act(async () => {
      window.location.hash = "users";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(await screen.findByText("没有管理权限")).toBeInTheDocument();
    expect(screen.queryByTestId("resource")).not.toBeInTheDocument();
  });
  test("preserves legacy links and supports browser route changes", async () => {
    authenticated();
    window.location.hash = "identity";
    render(<AdminApp />);
    expect(await screen.findByText("mapping-content")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "登录会话" }));
    expect(await screen.findByText("session-content")).toBeInTheDocument();
    expect(window.location.hash).toBe("#users/sessions");
  });
  test("keeps unknown counts distinct from zero and refreshes failures", async () => {
    authenticated();
    vi.mocked(AdminConsoleClient.prototype.overview).mockResolvedValueOnce({
      users: 4,
      teams: null,
      skills: 3,
      models: 1,
      pendingEvents: 0,
      failed: ["teams"],
    });
    render(<AdminApp />);
    expect(await screen.findByText("暂无法获取")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("部分概览数据");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /刷新/ })).not.toHaveClass(
        "ant-btn-loading",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /刷新/ }));
    await waitFor(() =>
      expect(AdminConsoleClient.prototype.overview).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(screen.queryByText("暂无法获取")).not.toBeInTheDocument(),
    );
  });
  test("allows forbidden users to clear session and switch account", async () => {
    vi.mocked(AdminConsoleClient.prototype.restore).mockResolvedValue({
      status: "forbidden",
      identity: administratorIdentity,
    });
    render(<AdminApp />);
    fireEvent.click(await screen.findByRole("button", { name: "切换账号" }));
    expect(
      await screen.findByRole("heading", { name: "登录企业管理后台" }),
    ).toBeInTheDocument();
    expect(AdminConsoleClient.prototype.logout).toHaveBeenCalledOnce();
  });
});
