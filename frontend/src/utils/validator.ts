import type { Step } from '@/models';

type ConditionConfig = {
  left?: string;
  op?: string;
  right?: string;
};

/**
 * 参数校验器
 * 
 * 负责验证节点配置参数的合法性
 * 0.0.1 版本支持：openUrl, click, type, waitFor, extract
 */

// 校验结果
export interface ValidationError {
  stepId: string;
  stepLabel: string;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationContext {
  insideLoopBody: boolean;
}

/**
 * 验证 URL 格式
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证是否为有效的 CSS 选择器语法（基础检查）
 */
function isValidSelector(selector: string): boolean {
  if (!selector || selector.trim().length === 0) {
    return false;
  }
  // 基础检查：不以特殊字符开头，长度合理
  const trimmed = selector.trim();
  if (trimmed.length < 1 || trimmed.length > 500) {
    return false;
  }
  return true;
}

/**
 * 验证变量名格式
 * 规则：以字母或下划线开头，只能包含字母、数字、下划线
 */
function isValidVariableName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * 验证 openUrl 节点
 */
function validateOpenUrl(step: Step): ValidationError[] {
  const errors: ValidationError[] = [];
  const config = step.data.config as { url?: string };

  if (!config.url || config.url.trim().length === 0) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'url',
      message: 'URL 不能为空',
    });
  } else if (!isValidUrl(config.url)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'url',
      message: 'URL 格式不正确，请以 http:// 或 https:// 开头',
    });
  }

  return errors;
}

/**
 * 验证 click 节点
 */
function validateClick(step: Step): ValidationError[] {
  const errors: ValidationError[] = [];
  const config = step.data.config as { selector?: string };

  if (!config.selector || config.selector.trim().length === 0) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'selector',
      message: '元素选择器不能为空',
    });
  } else if (!isValidSelector(config.selector)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'selector',
      message: '元素选择器格式不正确',
    });
  }

  return errors;
}

/**
 * 验证 type 节点
 */
function validateType(step: Step): ValidationError[] {
  const errors: ValidationError[] = [];
  const config = step.data.config as { selector?: string; text?: string };

  if (!config.selector || config.selector.trim().length === 0) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'selector',
      message: '元素选择器不能为空',
    });
  } else if (!isValidSelector(config.selector)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'selector',
      message: '元素选择器格式不正确',
    });
  }

  // text 可以为空字符串，但必须存在
  if (config.text === undefined || config.text === null) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'text',
      message: '输入文本不能为空',
    });
  }

  return errors;
}

/**
 * 验证 waitFor 节点
 */
function validateWaitFor(step: Step): ValidationError[] {
  const errors: ValidationError[] = [];
  const config = step.data.config as { selector?: string; waitMs?: number };

  const hasSelector = config.selector && config.selector.trim().length > 0;
  const hasWaitMs = config.waitMs !== undefined && config.waitMs !== null;

  // 二选一验证
  if (!hasSelector && !hasWaitMs) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'selector/waitMs',
      message: '必须指定等待元素或等待时间（二选一）',
    });
  } else if (hasSelector && hasWaitMs) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'selector/waitMs',
      message: '只能选择一种等待方式（元素或时间）',
    });
  }

  // 如果选择 selector，验证格式
  if (hasSelector && !isValidSelector(config.selector!)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'selector',
      message: '元素选择器格式不正确',
    });
  }

  // 如果选择 waitMs，验证范围
  if (hasWaitMs) {
    const waitMs = Number(config.waitMs);
    if (isNaN(waitMs) || waitMs < 0) {
      errors.push({
        stepId: step.id,
        stepLabel: step.data.label,
        field: 'waitMs',
        message: '等待时间必须为非负数（毫秒）',
      });
    } else if (waitMs > 300000) { // 5 分钟
      errors.push({
        stepId: step.id,
        stepLabel: step.data.label,
        field: 'waitMs',
        message: '等待时间不能超过 5 分钟（300000 毫秒）',
      });
    }
  }

  return errors;
}

/**
 * 验证 extract 节点
 */
function validateExtract(step: Step): ValidationError[] {
  const errors: ValidationError[] = [];
  const config = step.data.config as {
    selector?: string;
    saveAs?: string;
    as?: string;
    extractType?: string;
    mode?: string;
    attributeName?: string;
    childTagName?: string;
  };

  // 验证 selector
  if (!config.selector || config.selector.trim().length === 0) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'selector',
      message: '元素选择器不能为空',
    });
  } else if (!isValidSelector(config.selector)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'selector',
      message: '元素选择器格式不正确',
    });
  }

  // 验证变量名
  const outputName = config.saveAs || config.as;
  if (!outputName || outputName.trim().length === 0) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'saveAs',
      message: '变量名不能为空',
    });
  } else if (!isValidVariableName(outputName)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'saveAs',
      message: '变量名格式不正确，必须以字母或下划线开头，只能包含字母、数字、下划线',
    });
  }

  const extractMode = config.extractType || config.mode || 'text';
  const supportedModes = ['text', 'attribute', 'html', 'source', 'elementRef', 'iframeRef', 'childElement'];
  if (!supportedModes.includes(extractMode)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'extractType',
      message: '提取模式不支持',
    });
  }

  // 如果 mode 是 attribute，attributeName 不能为空
  if (extractMode === 'attribute') {
    if (!config.attributeName || config.attributeName.trim().length === 0) {
      errors.push({
        stepId: step.id,
        stepLabel: step.data.label,
        field: 'attributeName',
        message: '提取属性时，属性名不能为空',
      });
    }
  }

  if (extractMode === 'childElement' && (!config.childTagName || config.childTagName.trim().length === 0)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'childTagName',
      message: '提取子元素时，标签名不能为空',
    });
  }

  return errors;
}

function validateCondition(step: Step, fieldPrefix: string, condition?: ConditionConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  const supportedOps = ['exists', 'notExists', 'contains', 'notContains', 'equals', 'notEquals', 'lt', 'lte', 'gt', 'gte'];

  if (!condition) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: fieldPrefix,
      message: '条件不能为空',
    });
    return errors;
  }

  if (!condition.left || condition.left.trim().length === 0) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: `${fieldPrefix}.left`,
      message: '条件左值不能为空',
    });
  }

  if (!condition.op || !supportedOps.includes(condition.op)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: `${fieldPrefix}.op`,
      message: '条件操作符不支持',
    });
  }

  return errors;
}

function validateIf(step: Step, context: ValidationContext): ValidationError[] {
  const config = step.data.config as { condition?: ConditionConfig; then?: Step[]; else?: Step[] };
  const errors = validateCondition(step, 'condition', config.condition);

  if (!Array.isArray(config.then) || config.then.length === 0) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'then',
      message: 'THEN 子步骤不能为空',
    });
  } else {
    errors.push(...validateSteps(config.then, context).errors);
  }

  if (Array.isArray(config.else)) {
    errors.push(...validateSteps(config.else, context).errors);
  }

  return errors;
}

function validateForTimes(step: Step): ValidationError[] {
  const config = step.data.config as { times?: number; body?: Step[]; indexVar?: string };
  const errors: ValidationError[] = [];

  const times = Number(config.times);
  if (Number.isNaN(times) || times <= 0 || !Number.isInteger(times)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'times',
      message: '循环次数必须为正整数',
    });
  }

  if (config.indexVar && !isValidVariableName(config.indexVar)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'indexVar',
      message: '循环索引变量名格式不正确',
    });
  }

  if (!Array.isArray(config.body) || config.body.length === 0) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'body',
      message: 'BODY 子步骤不能为空',
    });
  } else {
    errors.push(...validateSteps(config.body, { insideLoopBody: true }).errors);
  }

  return errors;
}

function validateWhile(step: Step): ValidationError[] {
  const config = step.data.config as { condition?: ConditionConfig; maxIterations?: number; body?: Step[] };
  const errors = validateCondition(step, 'condition', config.condition);
  const maxIterations = Number(config.maxIterations);

  if (Number.isNaN(maxIterations) || maxIterations <= 0 || !Number.isInteger(maxIterations)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'maxIterations',
      message: '最大循环次数必须为正整数',
    });
  }

  if (!Array.isArray(config.body) || config.body.length === 0) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'body',
      message: 'BODY 子步骤不能为空',
    });
  } else {
    errors.push(...validateSteps(config.body, { insideLoopBody: true }).errors);
  }

  return errors;
}

function validateBreak(step: Step, context: ValidationContext): ValidationError[] {
  if (context.insideLoopBody) {
    return [];
  }

  return [{
    stepId: step.id,
    stepLabel: step.data.label,
    field: 'type',
    message: '退出循环节点只能放在循环 BODY 中',
  }];
}

function validateSelectorStep(step: Step, extraRequiredFields: string[] = []): ValidationError[] {
  const errors: ValidationError[] = [];
  const config = step.data.config as Record<string, unknown>;
  const selector = typeof config.selector === 'string' ? config.selector : '';

  if (!selector || selector.trim().length === 0) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'selector', message: '元素选择器不能为空' });
  } else if (!isValidSelector(selector)) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'selector', message: '元素选择器格式不正确' });
  }

  extraRequiredFields.forEach((field) => {
    const value = config[field];
    if (value === undefined || value === null || String(value).trim().length === 0) {
      errors.push({ stepId: step.id, stepLabel: step.data.label, field, message: `${field} 不能为空` });
    }
  });

  return errors;
}

function validateSimpleRequired(step: Step, fields: string[]): ValidationError[] {
  const config = step.data.config as Record<string, unknown>;
  return fields.flatMap((field) => {
    const value = config[field];
    if (value === undefined || value === null || String(value).trim().length === 0) {
      return [{ stepId: step.id, stepLabel: step.data.label, field, message: `${field} 不能为空` }];
    }
    return [];
  });
}

function validateSchemaStep(step: Step): ValidationError[] {
  const config = step.data.config as Record<string, unknown>;

  switch (step.type) {
    case 'newPage':
    case 'closePage':
    case 'reloadPage':
    case 'clearCookies':
    case 'closeBrowser':
      return [];
    case 'hover':
    case 'focus':
      return validateSelectorStep(step);
    case 'selectOption':
      return validateSelectorStep(step, ['value']);
    case 'uploadFiles':
      return validateSelectorStep(step, ['pathOrUrl']);
    case 'executeJs':
      return validateSimpleRequired(step, ['javascript']);
    case 'waitForResponse':
      return validateSimpleRequired(step, ['responseUrl']);
    case 'getUrl': {
      const errors = validateSimpleRequired(step, ['saveAs']);
      if (config.extract === 'queryParam' && (!config.paramName || String(config.paramName).trim().length === 0)) {
        errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'paramName', message: '提取查询参数时必须填写 paramName' });
      }
      return errors;
    }
    case 'downloadFile':
      return validateSimpleRequired(step, ['url']);
    case 'importText':
      return validateSimpleRequired(step, ['path', 'saveAs']);
    case 'totp':
      return validateSimpleRequired(step, ['secret', 'saveAs']);
    case 'getCookies':
      return validateSimpleRequired(step, ['saveAs']);
    case 'screenshotPage': {
      const format = typeof config.format === 'string' ? config.format : 'png';
      return format === 'png' || format === 'jpeg'
        ? []
        : [{ stepId: step.id, stepLabel: step.data.label, field: 'format', message: '截图格式仅支持 png 或 jpeg' }];
    }
    case 'switchPage':
      return validateSimpleRequired(step, ['matchBy', 'matchType', 'value']);
    case 'scrollPage': {
      if (config.scrollMode === 'pixel' && (config.pixels === undefined || config.pixels === null || Number.isNaN(Number(config.pixels)))) {
        return [{ stepId: step.id, stepLabel: step.data.label, field: 'pixels', message: '像素滚动模式必须填写 pixels' }];
      }
      return [];
    }
    default:
      return [];
  }
}

function validateForEachElement(step: Step): ValidationError[] {
  const config = step.data.config as { selector?: string; itemVar?: string; indexVar?: string; body?: Step[]; extractType?: string; attributeName?: string };
  const errors: ValidationError[] = [];

  if (!config.selector || !isValidSelector(config.selector)) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'selector', message: '元素选择器不能为空且格式必须正确' });
  }
  if (!config.itemVar || !isValidVariableName(config.itemVar)) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'itemVar', message: '项变量名格式不正确' });
  }
  if (config.indexVar && !isValidVariableName(config.indexVar)) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'indexVar', message: '索引变量名格式不正确' });
  }
  if (config.extractType === 'attribute' && (!config.attributeName || config.attributeName.trim().length === 0)) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'attributeName', message: '按属性提取时必须填写属性名' });
  }
  if (!Array.isArray(config.body) || config.body.length === 0) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'body', message: 'BODY 子步骤不能为空' });
  } else {
    errors.push(...validateSteps(config.body, { insideLoopBody: true }).errors);
  }
  return errors;
}

function validateForEachData(step: Step): ValidationError[] {
  const config = step.data.config as { dataVar?: string; itemVar?: string; indexVar?: string; body?: Step[] };
  const errors: ValidationError[] = [];

  if (!config.dataVar || !isValidVariableName(config.dataVar)) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'dataVar', message: '数据变量名格式不正确' });
  }
  if (!config.itemVar || !isValidVariableName(config.itemVar)) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'itemVar', message: '项变量名格式不正确' });
  }
  if (config.indexVar && !isValidVariableName(config.indexVar)) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'indexVar', message: '索引变量名格式不正确' });
  }
  if (!Array.isArray(config.body) || config.body.length === 0) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'body', message: 'BODY 子步骤不能为空' });
  } else {
    errors.push(...validateSteps(config.body, { insideLoopBody: true }).errors);
  }
  return errors;
}

function validateStartBrowser(step: Step, context: ValidationContext): ValidationError[] {
  const config = step.data.config as { onError?: string; onComplete?: string; body?: Step[] };
  const errors: ValidationError[] = [];

  if (config.onError && !['skip', 'abort'].includes(config.onError)) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'onError', message: '错误处理仅支持 skip 或 abort' });
  }
  if (config.onComplete && !['keep', 'close'].includes(config.onComplete)) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'onComplete', message: '完成后处理仅支持 keep 或 close' });
  }
  if (Array.isArray(config.body) && config.body.length > 0) {
    errors.push(...validateSteps(config.body, context).errors);
  }
  return errors;
}

/**
 * 验证单个步骤
 */
function validateStep(step: Step, context: ValidationContext): ValidationError[] {
  switch (step.type) {
    case 'openUrl':
      return validateOpenUrl(step);
    case 'click':
      return validateClick(step);
    case 'type':
      return validateType(step);
    case 'waitFor':
      return validateWaitFor(step);
    case 'extract':
      return validateExtract(step);
    case 'if':
      return validateIf(step, context);
    case 'forTimes':
      return validateForTimes(step);
    case 'while':
      return validateWhile(step);
    case 'newPage':
    case 'closePage':
    case 'switchPage':
    case 'reloadPage':
    case 'screenshotPage':
    case 'hover':
    case 'focus':
    case 'selectOption':
    case 'scrollPage':
    case 'uploadFiles':
    case 'executeJs':
    case 'waitForResponse':
    case 'getUrl':
    case 'downloadFile':
    case 'importText':
    case 'totp':
    case 'getCookies':
    case 'clearCookies':
    case 'closeBrowser':
      return validateSchemaStep(step);
    case 'forEachElement':
      return validateForEachElement(step);
    case 'forEachData':
      return validateForEachData(step);
    case 'startBrowser':
      return validateStartBrowser(step, context);
    case 'break':
      return validateBreak(step, context);
    default:
      return [{
        stepId: step.id,
        stepLabel: step.data.label,
        field: 'type',
        message: `未知的节点类型: ${step.type}`,
      }];
  }
}

/**
 * 验证所有步骤
 */
export function validateSteps(steps: Step[], context: ValidationContext = { insideLoopBody: false }): ValidationResult {
  const allErrors: ValidationError[] = [];

  for (const step of steps) {
    const errors = validateStep(step, context);
    allErrors.push(...errors);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * 验证画布是否可运行
 * 
 * 规则：
 * 1. 至少有一个步骤
 * 2. 第一个步骤必须是 openUrl
 * 3. 所有步骤配置有效
 */
export function validateCanvas(steps: Step[]): ValidationResult & { warnings: string[] } {
  const warnings: string[] = [];
  const errors: ValidationError[] = [];

  // 1. 检查是否有步骤
  if (steps.length === 0) {
    return {
      valid: false,
      errors: [{
        stepId: '',
        stepLabel: '',
        field: 'canvas',
        message: '画布为空，请至少添加一个节点',
      }],
      warnings: [],
    };
  }

  // 2. 检查第一个步骤是否为 openUrl
  if (steps[0].type !== 'openUrl') {
    warnings.push('建议第一个节点设置为"打开网页"，否则流程可能无法正常执行');
  }

  // 3. 验证所有步骤
  const stepValidation = validateSteps(steps);
  errors.push(...stepValidation.errors);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 格式化错误信息为显示文本
 */
export function formatErrors(errors: ValidationError[]): string {
  if (errors.length === 0) {
    return '';
  }

  const lines = errors.map(e => `• ${e.stepLabel}: ${e.message}`);
  return lines.join('\n');
}
