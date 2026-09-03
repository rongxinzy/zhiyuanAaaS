# 腾讯云控制台主题 Token

## 采集范围

采集时间：2026-09-03（Asia/Shanghai）

观测页面：

- `https://console.cloud.tencent.cn/`
- `https://console.cloud.tencent.cn/cvm/overview`
- `https://console.cloud.tencent.cn/cvm/instance/index?rid=1`
- `https://console.cloud.tencent.cn/cos`
- `https://console.cloud.tencent.cn/vpc`
- `https://console.cloud.tencent.cn/cam/overview`
- `https://console.cloud.tencent.cn/cam/user`

主要样式来源：

- `https://cloudcache.tencent-cloud.cn/qcloud/ui/tea-style/npm/css/themes/console-pack-1.1.11-beta.15.css`
- `https://cloudcache.tencent-cloud.cn/open_proj/proj_qcloud_v2/tea-style/dist/tea-0.0.10.min.css`

6 个页面均暴露同一组 Tea Design 计算变量。完整主题声明已本地化到 `src/ui/tea-theme.css`：浅色 931 个变量、深色 955 个变量。下文仍列出便于查阅的核心 token；完整 Color、Shadow、Border、Space、Font、Typography 及组件状态变量以该 CSS 文件为准。

## Palette

```css
--tea-color-palette-amber-2: #fce5ca;
--tea-color-palette-amber-8: #f2972b;
--tea-color-palette-amber-rgb: 242,151,43;
--tea-color-palette-black-30: rgba(0,0,0,0.3);
--tea-color-palette-black-35: rgba(0,0,0,0.35);
--tea-color-palette-black-5: rgba(0,0,0,0.05);
--tea-color-palette-black-90: rgba(0,0,0,0.9);
--tea-color-palette-bluegray-0: #f7f8fb;
--tea-color-palette-bluegray-3: #e6e9ef;
--tea-color-palette-bluegray-6: #97a3b7;
--tea-color-palette-bluegray-11: #2c3645;
--tea-color-palette-gray-3: #e7e7e7;
--tea-color-palette-gray-8: #777;
--tea-color-palette-gray-10: #4b4b4b;
--tea-color-palette-gray-13: #202020;
--tea-color-palette-green-1: #e7f8f0;
--tea-color-palette-green-2: #c2efd6;
--tea-color-palette-green-7: #29c770;
--tea-color-palette-green-8: #0cbf5b;
--tea-color-palette-red-3: #f5b9b9;
--tea-color-palette-white-25: hsla(0,0%,100%,0.25);
--tea-color-palette-white-3: hsla(0,0%,100%,0.55);
--tea-color-palette-white-45: hsla(0,0%,100%,0.45);
--tea-color-palette-white-5: hsla(0,0%,100%,0.05);
--tea-color-palette-white-60: hsla(0,0%,100%,0.6);
--tea-color-palette-white-90: hsla(0,0%,100%,0.9);
```

## Semantic Colors

```css
--tea-color-bg-brand-default: #0052d9;
--tea-color-bg-brand-lighten-default: #e3ecff;
--tea-color-bg-form-default: #fff;
--tea-color-bg-form-hover: #f7f8fb;
--tea-color-bg-primary-focus: #f2f4f8;
--tea-color-bg-secondary-hover: #e9ecf1;
--tea-color-bg-tertiary-focus: #e6e9ef;
--tea-color-bg-amber-lighten-lighten: #fff3e4;
--tea-color-bg-warning-focus: #ffa760;
--tea-color-bg-warning-hover: #ff8420;
--tea-color-border-hover: #0052d9;
--tea-color-border-secondary: #e9ecf1;
--tea-color-border-secondary-hover: #e6e9ef;
--tea-color-border-tertiary-disabled: #d6dbe3;
--tea-color-border-tertiary-hover: #bcc4d0;
--tea-color-border-on-bg-brand-active: #0034b5;
--tea-color-border-on-bg-brand-lighten-default: #266fe8;
--tea-color-border-on-bg-error-active: #b42c3f;
--tea-color-border-on-bg-success-hover: #29c770;
--tea-color-border-on-bg-warning-default: #ff7800;
--tea-color-border-on-bg-warning-disabled: #ffca9f;
--tea-color-border-on-bg-amber-hover: #fff;
--tea-color-border-on-bg-yellow-disabled: #fff;
--tea-color-border-on-bg-yellow-hover: #fff;
--tea-color-function-brand-bright: #d4e3fc;
--tea-color-function-brand-focus: #699ef5;
--tea-color-function-error-active: #b42c3f;
--tea-color-function-error-default: #f64041;
--tea-color-function-success-focus: #66d799;
--tea-color-function-warning-focus: #ffa760;
--tea-color-text-brand-active: #0034b5;
--tea-color-text-brand-focus: #699ef5;
--tea-color-text-error-focus: #ef8b8b;
--tea-color-text-form-disabled: rgba(0,0,0,0.3);
--tea-color-text-form-hover: rgba(0,0,0,0.9);
--tea-color-text-highlight-primary: rgba(0,0,0,0.9);
--tea-color-text-link-default: #0052d9;
--tea-color-text-on-bg-brand-lighten-default: #0034b5;
--tea-color-text-on-bg-amber-default: hsla(0,0%,100%,0.9);
--tea-color-text-on-bg-error-disabled: hsla(0,0%,100%,0.7);
--tea-color-text-on-bg-warning-disabled: hsla(0,0%,100%,0.7);
```

## Component Tokens

```css
--alert-error-color-bg: #fce8e8;
--alert-error-color-border: #fce8e8;
--alert-error-color-icon: #b42c3f;
--alert-error-color-text: #b42c3f;
--alert-notice-color-bg: #fff;
--alert-success-color-bg: #e7f8f0;
--alert-warning-color-bg: #ffeddf;
--button-color-bg-solid-active-brand: #0034b5;
--button-color-bg-solid-default-brand: #0052d9;
--button-color-bg-solid-hover-brand: #266fe8;
--button-color-bg-solid-focus-brand: #699ef5;
--button-color-bg-solid-active-neutral: #181818;
--button-color-bg-solid-default-error: #f64041;
--button-color-bg-solid-default-warning: #ff7800;
--button-color-bg-solid-focus-neutral: #383838;
--button-color-bg-solid-hover-neutral: #383838;
--button-color-bg-solid-hover-warning: #ff8420;
--button-color-border-outline-hover-neutral: #e6e9ef;
--button-color-border-solid-active-warning: #c04100;
--button-color-border-solid-default-error: #f64041;
--button-color-border-solid-disabled-warning: #ffca9f;
--button-color-border-solid-focus-warning: #ffa760;
--button-color-text-outline-default-neutral: rgba(0,0,0,0.9);
--button-color-text-outline-disabled-neutral: rgba(0,0,0,0.3);
--button-color-text-outline-hover-neutral: rgba(0,0,0,0.9);
--button-color-text-solid-default-warning: hsla(0,0%,100%,0.9);
--button-color-text-solid-hover-error: hsla(0,0%,100%,0.9);
--button-color-text-solid-hover-warning: hsla(0,0%,100%,0.9);
--button-font-size-sm: 12px;
--button-font-size-lg: 14px;
--button-size-height-md: 30px;
--button-size-height-lg: 40px;
--button-shadow-solid-brand: 0px 2px 0px 0px rgba(0,82,217,0.05);
--card-body-title-font-size: 16px;
--card-box-shadow-default: 0px 1px 4px 0px rgba(0,0,0,0.05);
--card-color-borde-inner: #e9ecf1;
--menu-badge-text-default: rgba(0,0,0,0.5);
--menu-border: #e9ecf1;
--menu-icon-color-active: hsla(0,0%,100%,0.9);
--menu-icon-jump-color-text: #0052d9;
--menu-item-bg-active: #0052d9;
--rate-color-bg-default: #d6dbe3;
--segment-button-color-border-selected: #0052d9;
--segment-button-color-text-default: rgba(0,0,0,0.9);
--table-cell-space-horizontal-sm: 10px;
--table-color-bg-primary-hover: #f7f8fb;
--table-color-mask-default: hsla(0,0%,100%,0.8);
--tabs-color-border-active: #0052d9;
--tabs-item-color-bg-segment-active: #fff;
--tag-input-color-bg: #fff;
--tag-input-color-border: #e6e9ef;
```

## Typography

```css
--tea-font-size-300: 12px;
--tea-font-size-600: 24px;
--tea-font-size-7: 28px;
--tea-font-size-8: 32px;
--tea-font-size-1050: 42px;
--tea-font-line-height-350: 14px;
--tea-font-line-height-1: 20px;
--tea-font-line-height-700: 28px;
--tea-font-line-height-6: 32px;
--tea-font-line-height-7: 36px;
--tea-font-line-height-900: 36px;
--tea-font-line-height-10: 54px;
--tea-font-line-height-1350: 54px;
--tea-typography-body-default: normal 400 12px/20px -apple-system,BlinkMacSystemFont,"pingfang SC","Hiragina Sans GB","Helvetica Neue",Helvetica,"microsoft yahei ui","microsoft yahei",simsun,arial,sans-serif;
--tea-typography-body-md-font-size: 14px;
--tea-typography-body-md-font-weight: 400;
--tea-typography-heading-1-font-weight: 600;
--tea-typography-heading-1-line-height: 40px;
--tea-typography-heading-3: normal 600 24px/32px -apple-system,BlinkMacSystemFont,"pingfang SC","Hiragina Sans GB","Helvetica Neue",Helvetica,"microsoft yahei ui","microsoft yahei",simsun,arial,sans-serif;
--tea-typography-heading-3-font-weight: 600;
--tea-typography-heading-4: normal 600 20px/28px -apple-system,BlinkMacSystemFont,"pingfang SC","Hiragina Sans GB","Helvetica Neue",Helvetica,"microsoft yahei ui","microsoft yahei",simsun,arial,sans-serif;
--tea-typography-heading-5-font-weight: 600;
--tea-typography-heading-6-font-weight: 600;
--tea-typography-title-lg: normal 600 16px/24px -apple-system,BlinkMacSystemFont,"pingfang SC","Hiragina Sans GB","Helvetica Neue",Helvetica,"microsoft yahei ui","microsoft yahei",simsun,arial,sans-serif;
```

## Geometry and Shadows

```css
--tea-border-radius-0: 0px;
--tea-border-radius-default: 0px;
--tea-border-radius-200: 8px;
--tea-space-200: 8px;
--tea-space-600: 24px;
--tea-space-1000: 40px;
--tea-space-1200: 48px;
--tea-space-1600: 64px;
--tea-size-offset-400: 16px;
--tea-size-spread-0100: -4px;
--tea-size-spread-0300: -12px;
--tea-size-spread-0400: -16px;
--tea-size-spread-700: 28px;
--tea-size-spread-800: 32px;
--tea-size-spread-1000: 40px;
--tea-size-blur-200: 8px;
--tea-size-blur-1500: 60px;
--tea-shadow-xs: 0px 1px 4px 0px rgba(0,0,0,0.05);
--tea-shadow-xs-color-1: rgba(0,0,0,0.05);
--tea-shadow-sm-color-2: rgba(0,0,0,0.05);
--tea-shadow-sm-offsetx-2: 0px;
--tea-shadow-md-blur-1: 12px;
--tea-shadow-md-offsetx-2: 0px;
--tea-shadow-lg-offsety-1: 24px;
--tea-shadow-lg-spread-1: -12px;
--tea-shadow-xl-spread-1: -12px;
```

## Cross-page Differences

The following computed values differed on the sampled pages; the VPC page used a slightly different blue-gray/green scale:

```css
/* common pages */
--alert-success-color-bg: #e7f8f0;
--button-color-text-outline-default-neutral: rgba(0,0,0,0.9);
--button-color-text-outline-hover-neutral: rgba(0,0,0,0.9);
--table-color-bg-primary-hover: #f7f8fb;
--tea-color-bg-form-hover: #f7f8fb;
--tea-color-palette-green-1: #e7f8f0;

/* VPC page */
--alert-success-color-bg: #e0f7eb;
--button-color-text-outline-default-neutral: #0052d9;
--button-color-text-outline-hover-neutral: #0052d9;
--table-color-bg-primary-hover: #f2f4f8;
--tea-color-bg-form-hover: #f2f4f8;
--tea-color-palette-green-1: #e0f7eb;
```

## Implementation Notes

- The dominant brand color is `#0052d9`; active brand states use `#0034b5` and focus states use `#699ef5`.
- The console uses a compact 12px body baseline, 14px medium body text, 30px medium controls, and 40px large controls.
- Default card radius is `0px`; the available `8px` radius is the main rounded variant.
- The extracted values are computed values observed in the authenticated console, not a guarantee of an official public design-system API. Revalidate after the remote stylesheet version changes.
