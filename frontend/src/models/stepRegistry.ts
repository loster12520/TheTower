import type { StepType } from '@/models';

export type NodeGroup = 'page' | 'wait' | 'data' | 'flow';
export type NodeFormType = 'schema' | 'custom';
export type NodeFieldType = 'text' | 'textarea' | 'number' | 'select' | 'radio';

export interface NodeFieldOption {
  label: string;
  value: string | number | boolean;
}

export interface NodeFieldSchema {
  name: string;
  label: string;
  type: NodeFieldType;
  required?: boolean;
  placeholder?: string;
  extra?: string;
  options?: NodeFieldOption[];
  min?: number;
  max?: number;
}

export interface NodeDefinition {
  type: StepType;
  label: string;
  color: string;
  icon: string;
  group: NodeGroup;
  isContainer?: boolean;
  formType: NodeFormType;
  defaultConfig: Record<string, unknown>;
  fields?: NodeFieldSchema[];
}

export const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'openUrl',
    label: '打开网页',
    color: '#2563eb',
    icon: '🌐',
    group: 'page',
    formType: 'schema',
    defaultConfig: { url: '' },
    fields: [{ name: 'url', label: '网址 URL', type: 'text', required: true, placeholder: 'https://example.com', extra: '支持后端变量模板，例如 ${baseUrl}/login' }],
  },
  {
    type: 'click',
    label: '点击元素',
    color: '#16a34a',
    icon: '👆',
    group: 'page',
    formType: 'schema',
    defaultConfig: { selector: '', clickAction: 'single', mouseButton: 'left' },
    fields: [
      { name: 'selector', label: '元素选择器', type: 'text', required: true, placeholder: '#submit-button' },
      { name: 'clickAction', label: '点击动作', type: 'radio', options: [{ label: '单击', value: 'single' }, { label: '双击', value: 'double' }] },
      { name: 'mouseButton', label: '鼠标按键', type: 'select', options: [{ label: '左键', value: 'left' }, { label: '中键', value: 'middle' }, { label: '右键', value: 'right' }] },
      { name: 'timeoutMs', label: '超时（毫秒）', type: 'number', min: 0 },
    ],
  },
  {
    type: 'type',
    label: '输入文本',
    color: '#f59e0b',
    icon: '⌨️',
    group: 'page',
    formType: 'schema',
    defaultConfig: { selector: '', text: '', contentMode: 'fixed', clearBeforeType: false },
    fields: [
      { name: 'selector', label: '元素选择器', type: 'text', required: true, placeholder: '#username' },
      { name: 'contentMode', label: '内容来源', type: 'select', options: [{ label: '固定文本', value: 'fixed' }, { label: '变量', value: 'useVar' }, { label: '随机项', value: 'random' }, { label: '顺序项', value: 'sequence' }, { label: '随机数字', value: 'randomNumber' }] },
      { name: 'text', label: '输入文本', type: 'textarea', placeholder: '要输入的文本' },
      { name: 'varName', label: '变量名', type: 'text', placeholder: 'username' },
      { name: 'contents', label: '候选内容', type: 'textarea', placeholder: '每行一个值，或用逗号分隔' },
      { name: 'randomMin', label: '随机最小值', type: 'number' },
      { name: 'randomMax', label: '随机最大值', type: 'number' },
      { name: 'intervalMsPerChar', label: '每字符延迟（毫秒）', type: 'number', min: 0 },
      { name: 'timeoutMs', label: '超时（毫秒）', type: 'number', min: 0 },
    ],
  },
  {
    type: 'waitFor',
    label: '等待',
    color: '#7c3aed',
    icon: '⏱️',
    group: 'wait',
    formType: 'schema',
    defaultConfig: { selector: '', waitMs: undefined, visible: false },
    fields: [
      { name: 'selector', label: '元素选择器', type: 'text', placeholder: '#result' },
      { name: 'waitMs', label: '固定等待（毫秒）', type: 'number', min: 0 },
      { name: 'minMs', label: '随机等待最小值', type: 'number', min: 0 },
      { name: 'maxMs', label: '随机等待最大值', type: 'number', min: 0 },
      { name: 'visible', label: '等待可见', type: 'radio', options: [{ label: '否', value: false }, { label: '是', value: true }] },
      { name: 'saveAs', label: '保存结果变量', type: 'text', placeholder: 'waitReady' },
      { name: 'timeoutMs', label: '超时（毫秒）', type: 'number', min: 0 },
    ],
  },
  {
    type: 'extract',
    label: '提取数据',
    color: '#db2777',
    icon: '📋',
    group: 'data',
    formType: 'schema',
    defaultConfig: { selector: '', saveAs: '', extractType: 'text' },
    fields: [
      { name: 'selector', label: '元素选择器', type: 'text', required: true, placeholder: 'h1' },
      { name: 'saveAs', label: '变量名', type: 'text', required: true, placeholder: 'title' },
      { name: 'extractType', label: '提取方式', type: 'select', options: [{ label: '文本', value: 'text' }, { label: '属性', value: 'attribute' }, { label: 'HTML', value: 'html' }, { label: '源码', value: 'source' }, { label: '元素引用', value: 'elementRef' }, { label: 'Iframe 引用', value: 'iframeRef' }, { label: '子元素文本', value: 'childElement' }] },
      { name: 'attributeName', label: '属性名', type: 'text', placeholder: 'href' },
      { name: 'childTagName', label: '子元素标签', type: 'text', placeholder: 'span' },
    ],
  },
  { type: 'if', label: 'IF 条件', color: '#0f766e', icon: '🔀', group: 'flow', isContainer: true, formType: 'custom', defaultConfig: { condition: { left: '', op: 'exists', right: '' }, then: [], else: [] } },
  { type: 'forTimes', label: 'For 次数', color: '#2563eb', icon: '🔁', group: 'flow', isContainer: true, formType: 'custom', defaultConfig: { times: 1, indexVar: 'index', body: [] } },
  { type: 'while', label: 'While 循环', color: '#7c3aed', icon: '♾️', group: 'flow', isContainer: true, formType: 'custom', defaultConfig: { condition: { left: '', op: 'exists', right: '' }, maxIterations: 10, body: [] } },
  { type: 'break', label: '退出循环', color: '#dc2626', icon: '⛔', group: 'flow', formType: 'custom', defaultConfig: {} },
  { type: 'newPage', label: '新建标签页', color: '#0284c7', icon: '🗂️', group: 'page', formType: 'schema', defaultConfig: { pageAlias: '', switchToNew: true }, fields: [{ name: 'pageAlias', label: '页面别名', type: 'text', placeholder: 'tab2' }, { name: 'switchToNew', label: '切换到新页', type: 'radio', options: [{ label: '否', value: false }, { label: '是', value: true }] }, { name: 'timeoutMs', label: '超时（毫秒）', type: 'number', min: 0 }] },
  { type: 'closePage', label: '关闭标签页', color: '#0f766e', icon: '🧹', group: 'page', formType: 'schema', defaultConfig: { pageAlias: '' }, fields: [{ name: 'pageAlias', label: '页面别名', type: 'text', placeholder: '留空时关闭当前页' }] },
  { type: 'switchPage', label: '切换标签页', color: '#0369a1', icon: '🔖', group: 'page', formType: 'schema', defaultConfig: { matchBy: 'alias', matchType: 'equals', value: '' }, fields: [{ name: 'matchBy', label: '匹配字段', type: 'select', required: true, options: [{ label: '别名', value: 'alias' }, { label: '标题', value: 'title' }, { label: 'URL', value: 'url' }] }, { name: 'matchType', label: '匹配方式', type: 'select', required: true, options: [{ label: '完全匹配', value: 'equals' }, { label: '包含', value: 'contains' }] }, { name: 'value', label: '匹配值', type: 'text', required: true }, { name: 'timeoutMs', label: '超时（毫秒）', type: 'number', min: 0 }] },
  { type: 'reloadPage', label: '刷新页面', color: '#0ea5e9', icon: '🔄', group: 'page', formType: 'schema', defaultConfig: {}, fields: [{ name: 'timeoutMs', label: '超时（毫秒）', type: 'number', min: 0 }] },
  { type: 'screenshotPage', label: '页面截图', color: '#9333ea', icon: '📸', group: 'page', formType: 'schema', defaultConfig: { name: '', format: 'png', fullPage: false }, fields: [{ name: 'name', label: '文件名', type: 'text', placeholder: 'homepage-shot' }, { name: 'format', label: '格式', type: 'select', options: [{ label: 'PNG', value: 'png' }, { label: 'JPEG', value: 'jpeg' }] }, { name: 'fullPage', label: '整页截图', type: 'radio', options: [{ label: '否', value: false }, { label: '是', value: true }] }, { name: 'quality', label: 'JPEG 质量', type: 'number', min: 1, max: 100 }] },
  { type: 'hover', label: '悬停元素', color: '#10b981', icon: '🖱️', group: 'page', formType: 'schema', defaultConfig: { selector: '' }, fields: [{ name: 'selector', label: '元素选择器', type: 'text', required: true }, { name: 'timeoutMs', label: '超时（毫秒）', type: 'number', min: 0 }] },
  { type: 'focus', label: '聚焦元素', color: '#059669', icon: '🎯', group: 'page', formType: 'schema', defaultConfig: { selector: '' }, fields: [{ name: 'selector', label: '元素选择器', type: 'text', required: true }, { name: 'timeoutMs', label: '超时（毫秒）', type: 'number', min: 0 }] },
  { type: 'selectOption', label: '选择下拉项', color: '#ca8a04', icon: '🧭', group: 'page', formType: 'schema', defaultConfig: { selector: '', value: '' }, fields: [{ name: 'selector', label: '元素选择器', type: 'text', required: true }, { name: 'value', label: '选项值', type: 'text', required: true }, { name: 'timeoutMs', label: '超时（毫秒）', type: 'number', min: 0 }] },
  { type: 'scrollPage', label: '滚动页面', color: '#ea580c', icon: '🪜', group: 'page', formType: 'schema', defaultConfig: { scrollMode: 'position', position: 'bottom' }, fields: [{ name: 'scrollMode', label: '滚动模式', type: 'radio', options: [{ label: '位置', value: 'position' }, { label: '像素', value: 'pixel' }] }, { name: 'position', label: '页面位置', type: 'select', options: [{ label: '顶部', value: 'top' }, { label: '中间', value: 'middle' }, { label: '底部', value: 'bottom' }] }, { name: 'pixels', label: '滚动像素', type: 'number' }] },
  { type: 'uploadFiles', label: '上传文件', color: '#0891b2', icon: '📤', group: 'page', formType: 'schema', defaultConfig: { selector: '', source: 'localFile', pathOrUrl: '' }, fields: [{ name: 'selector', label: '元素选择器', type: 'text', required: true }, { name: 'source', label: '文件来源', type: 'select', options: [{ label: '本地文件', value: 'localFile' }, { label: 'URL 下载', value: 'url' }] }, { name: 'pathOrUrl', label: '路径或 URL', type: 'text', required: true }, { name: 'timeoutMs', label: '超时（毫秒）', type: 'number', min: 0 }] },
  { type: 'executeJs', label: '执行 JS', color: '#4f46e5', icon: '🧪', group: 'data', formType: 'schema', defaultConfig: { javascript: '', injectVars: '', saveAs: '' }, fields: [{ name: 'javascript', label: 'JavaScript', type: 'textarea', required: true, placeholder: '() => document.title' }, { name: 'injectVars', label: '注入变量', type: 'text', placeholder: 'idx,item 或 idx,itemVar' }, { name: 'saveAs', label: '结果变量', type: 'text', placeholder: 'jsResult' }, { name: 'timeoutMs', label: '超时（毫秒）', type: 'number', min: 0 }] },
  { type: 'waitForResponse', label: '等待响应', color: '#8b5cf6', icon: '📡', group: 'wait', formType: 'schema', defaultConfig: { responseUrl: '', matchType: 'contains', saveAs: '' }, fields: [{ name: 'responseUrl', label: '响应 URL', type: 'text', required: true }, { name: 'matchType', label: '匹配方式', type: 'select', options: [{ label: '包含', value: 'contains' }, { label: '完全匹配', value: 'equals' }] }, { name: 'saveAs', label: '结果变量', type: 'text', placeholder: 'responseMatched' }, { name: 'timeoutMs', label: '超时（毫秒）', type: 'number', min: 0 }] },
  { type: 'getUrl', label: '获取 URL', color: '#14b8a6', icon: '🔗', group: 'data', formType: 'schema', defaultConfig: { extract: 'full', saveAs: '' }, fields: [{ name: 'extract', label: '提取内容', type: 'select', options: [{ label: '完整 URL', value: 'full' }, { label: '来源域名', value: 'origin' }, { label: '查询参数', value: 'queryParam' }] }, { name: 'paramName', label: '参数名', type: 'text', placeholder: 'id' }, { name: 'saveAs', label: '结果变量', type: 'text', required: true, placeholder: 'currentUrl' }] },
  { type: 'downloadFile', label: '下载文件', color: '#2563eb', icon: '📥', group: 'data', formType: 'schema', defaultConfig: { url: '', saveDir: '', fileName: '', saveAs: '' }, fields: [{ name: 'url', label: '下载 URL', type: 'text', required: true }, { name: 'saveDir', label: '保存目录', type: 'text', placeholder: 'reports' }, { name: 'fileName', label: '文件名', type: 'text', placeholder: 'report.pdf' }, { name: 'saveAs', label: '结果变量', type: 'text', placeholder: 'downloadPath' }, { name: 'timeoutMs', label: '超时（毫秒）', type: 'number', min: 0 }] },
  { type: 'importText', label: '导入文本', color: '#475569', icon: '📝', group: 'data', formType: 'schema', defaultConfig: { path: '', saveAs: '' }, fields: [{ name: 'path', label: '文件路径', type: 'text', required: true }, { name: 'saveAs', label: '结果变量', type: 'text', required: true }] },
  { type: 'totp', label: '生成验证码', color: '#be123c', icon: '🔐', group: 'data', formType: 'schema', defaultConfig: { secret: '', saveAs: '' }, fields: [{ name: 'secret', label: '密钥', type: 'text', required: true }, { name: 'saveAs', label: '结果变量', type: 'text', required: true }] },
  { type: 'getCookies', label: '获取 Cookies', color: '#0f766e', icon: '🍪', group: 'data', formType: 'schema', defaultConfig: { saveAs: '' }, fields: [{ name: 'saveAs', label: '结果变量', type: 'text', required: true }] },
  { type: 'clearCookies', label: '清空 Cookies', color: '#7f1d1d', icon: '🧽', group: 'data', formType: 'schema', defaultConfig: {} },
  { type: 'forEachElement', label: '遍历元素', color: '#7c3aed', icon: '🧬', group: 'flow', isContainer: true, formType: 'custom', defaultConfig: { selector: '', itemVar: 'item', indexVar: 'index', extractType: 'text', body: [] } },
  { type: 'forEachData', label: '遍历数据', color: '#1d4ed8', icon: '🧾', group: 'flow', isContainer: true, formType: 'custom', defaultConfig: { dataVar: 'items', itemVar: 'item', indexVar: 'index', body: [] } },
  { type: 'startBrowser', label: '浏览器上下文', color: '#334155', icon: '🧱', group: 'flow', isContainer: true, formType: 'custom', defaultConfig: { envSerial: '', onError: 'abort', onComplete: 'close', body: [] } },
];

export const NODE_DEFINITION_MAP = Object.fromEntries(NODE_DEFINITIONS.map((definition) => [definition.type, definition])) as Record<StepType, NodeDefinition>;

export const getNodeDefinition = (type: StepType): NodeDefinition => NODE_DEFINITION_MAP[type];

export const getDefaultNodeConfig = (type: StepType): Record<string, unknown> => {
  return JSON.parse(JSON.stringify(getNodeDefinition(type).defaultConfig)) as Record<string, unknown>;
};