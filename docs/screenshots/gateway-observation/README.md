# Model gateway observation preview

These screenshots show the built Admin Console against a disposable local
Kubernetes acceptance environment with AEP, Higress, Prometheus and Loki.
The organization data belongs to local test fixtures. They do not represent
a production deployment or a billing report.

- `light.png`: linked request and Token charts, native hover guides, time controls
  and the unavailable cost region in the light theme.
- `dark.png`: the same surface using the root Ant Design dark algorithm.
- `group-narrow.png`: the grouping heading and selector at a 392px viewport.

Browser acceptance covered linked mouse-wheel zoom and horizontal drag, hover
tooltips, request/Token visibility controls, a custom start/end range sent to AEP,
keyboard grouping selection and layout widths from 320px to 1440px.

To inspect the interaction, open the model gateway observation tab in a running
Admin Console, select a time range containing native samples, narrow the chart
slider and drag the plot horizontally. The other chart follows the visible
range. Hover shows the time guide and native sample values. Select a custom
start/end range to change the API query. Resize the page to verify the grouping
selector wraps below its heading without shrinking or overlapping the text.

Successful-request series and cost data are unavailable in the current API;
the UI does not derive them from other metrics. Count and Token cards represent
the latest native lookback-window sample, rather than totals for the selected
time range.
