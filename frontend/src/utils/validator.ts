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
  return validateSelectorOrElementRefTarget(step);
}

/**
 * 验证 type 节点
 */
function validateType(step: Step): ValidationError[] {
  const errors = validateSelectorOrElementRefTarget(step);
  const config = step.data.config as { text?: string };

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
    elementRefVar?: string;
    saveAs?: string;
    as?: string;
    extractType?: string;
    mode?: string;
    attributeName?: string;
    childTagName?: string;
  };

  errors.push(...validateSelectorOrElementRefTarget(step));

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

function validateTextExtract(step: Step): ValidationError[] {
  const config = step.data.config as { input?: string; pattern?: string; saveAs?: string; groupIndex?: number };
  const errors = validateSimpleRequired(step, ['input', 'pattern', 'saveAs']);

  if (config.saveAs && !isValidVariableName(config.saveAs)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'saveAs',
      message: '结果变量名格式不正确，必须以字母或下划线开头，只能包含字母、数字、下划线',
    });
  }

  if (config.groupIndex !== undefined && (Number.isNaN(Number(config.groupIndex)) || Number(config.groupIndex) < 0)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'groupIndex',
      message: '分组序号必须为大于等于 0 的整数',
    });
  }

  return errors;
}

function validateCloseOtherPages(step: Step): ValidationError[] {
  const config = step.data.config as { keep?: string; pageAlias?: string };
  const errors: ValidationError[] = [];
  const keep = (config.keep || 'current').trim();

  if (!['current', 'alias'].includes(keep)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'keep',
      message: '保留页面仅支持 current 或 alias',
    });
  }

  if (keep === 'alias' && (!config.pageAlias || config.pageAlias.trim().length === 0)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'pageAlias',
      message: '按别名保留页面时必须填写 pageAlias',
    });
  }

  return errors;
}

function validateElementOrderConfig(step: Step): ValidationError[] {
  const config = step.data.config as { elementOrder?: Record<string, unknown> };
  const order = config.elementOrder;

  if (!order || typeof order !== 'object') {
    return [];
  }

  const type = typeof order.type === 'string' ? order.type : typeof order.mode === 'string' ? order.mode : 'first';
  const normalizedType = type.toLowerCase();
  const errors: ValidationError[] = [];

  if (!['first', 'last', 'index', 'random', 'randomrange'].includes(normalizedType)) {
    errors.push({
      stepId: step.id,
      stepLabel: step.data.label,
      field: 'elementOrder.type',
      message: '元素顺序仅支持 first、last、index、random、randomRange',
    });
    return errors;
  }

  if (normalizedType === 'index') {
    const index = Number(order.index);
    if (Number.isNaN(index) || !Number.isInteger(index) || index < 0) {
      errors.push({
        stepId: step.id,
        stepLabel: step.data.label,
        field: 'elementOrder.index',
        message: '元素序号必须为大于等于 0 的整数',
      });
    }
  }

  if (normalizedType === 'randomrange') {
    const min = Number(order.min);
    const max = Number(order.max);
    if (Number.isNaN(min) || !Number.isInteger(min) || min < 0) {
      errors.push({
        stepId: step.id,
        stepLabel: step.data.label,
        field: 'elementOrder.min',
        message: '随机范围最小值必须为大于等于 0 的整数',
      });
    }
    if (Number.isNaN(max) || !Number.isInteger(max) || max < 0) {
      errors.push({
        stepId: step.id,
        stepLabel: step.data.label,
        field: 'elementOrder.max',
        message: '随机范围最大值必须为大于等于 0 的整数',
      });
    }
  }

  return errors;
}

function validateSelectorOrElementRefTarget(step: Step): ValidationError[] {
  const config = step.data.config as Record<string, unknown>;
  const selector = typeof config.selector === 'string' ? config.selector.trim() : '';
  const elementRefVar = typeof config.elementRefVar === 'string' ? config.elementRefVar.trim() : '';
  const errors: ValidationError[] = [];

  if (!selector && !elementRefVar) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'selector', message: '元素选择器或元素引用变量至少填写一项' });
    return errors;
  }

  if (selector && !isValidSelector(selector)) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'selector', message: '元素选择器格式不正确' });
  }

  if (elementRefVar && !isValidVariableName(elementRefVar)) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'elementRefVar', message: '元素引用变量格式不正确' });
  }

  errors.push(...validateElementOrderConfig(step));
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
  const errors = validateSelectorOrElementRefTarget(step);
  const config = step.data.config as Record<string, unknown>;

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

function validateVariableReference(step: Step, field: string, label: string = field): ValidationError[] {
  const config = step.data.config as Record<string, unknown>;
  const value = typeof config[field] === 'string' ? config[field].trim() : '';

  if (!value) {
    return [{ stepId: step.id, stepLabel: step.data.label, field, message: `${label} 不能为空` }];
  }

  if (!isValidVariableName(value)) {
    return [{ stepId: step.id, stepLabel: step.data.label, field, message: `${label} 格式不正确` }];
  }

  return [];
}

function resolveVariableReference(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value.trim());
  return match?.[1] ?? null;
}

function getCanonicalDataStepConfig(config: Record<string, unknown>) {
  const sourceVar = typeof config.sourceVar === 'string' && config.sourceVar.trim().length > 0
    ? config.sourceVar.trim()
    : typeof config.inputVar === 'string' && config.inputVar.trim().length > 0
      ? config.inputVar.trim()
      : resolveVariableReference(config.value);

  const outputVar = typeof config.outputVar === 'string' && config.outputVar.trim().length > 0
    ? config.outputVar.trim()
    : typeof config.saveAs === 'string' && config.saveAs.trim().length > 0
      ? config.saveAs.trim()
      : null;

  const targetFormat = typeof config.targetFormat === 'string' && config.targetFormat.trim().length > 0
    ? config.targetFormat.trim()
    : config.direction === 'stringify'
      ? 'string'
      : 'object';

  return {
    sourceVar,
    outputVar,
    targetFormat,
    rawValue: typeof config.value === 'string' ? config.value.trim() : '',
  };
}

function validateSchemaStep(step: Step): ValidationError[] {
  const config = step.data.config as Record<string, unknown>;

  switch (step.type) {
    case 'keyboardPress':
      return validateSimpleRequired(step, ['key']);
    case 'keyboardHotkey':
      return validateSimpleRequired(step, ['key']);
    case 'textExtract':
      return validateTextExtract(step);
    case 'goBack':
      return [];
    case 'closeOtherPages':
      return validateCloseOtherPages(step);
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
    case 'convertJson': {
      const canonical = getCanonicalDataStepConfig(config);
      const errors = [
        ...(canonical.sourceVar
          ? isValidVariableName(canonical.sourceVar)
            ? []
            : [{ stepId: step.id, stepLabel: step.data.label, field: 'sourceVar', message: '输入变量格式不正确' }]
          : canonical.rawValue
            ? []
            : [{ stepId: step.id, stepLabel: step.data.label, field: 'sourceVar', message: '输入变量不能为空' }]),
        ...(canonical.outputVar
          ? isValidVariableName(canonical.outputVar)
            ? []
            : [{ stepId: step.id, stepLabel: step.data.label, field: 'outputVar', message: '输出变量格式不正确' }]
          : [{ stepId: step.id, stepLabel: step.data.label, field: 'outputVar', message: '输出变量不能为空' }]),
      ];
      if (!['object', 'string'].includes(String(canonical.targetFormat || 'object'))) {
        errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'targetFormat', message: '转换目标仅支持 object 或 string' });
      }
      return errors;
    }
    case 'extractKey': {
      const canonical = getCanonicalDataStepConfig(config);
      const errors = [
        ...(canonical.sourceVar
          ? isValidVariableName(canonical.sourceVar)
            ? []
            : [{ stepId: step.id, stepLabel: step.data.label, field: 'sourceVar', message: '输入变量格式不正确' }]
          : [{ stepId: step.id, stepLabel: step.data.label, field: 'sourceVar', message: '输入变量不能为空' }]),
        ...(canonical.outputVar
          ? isValidVariableName(canonical.outputVar)
            ? []
            : [{ stepId: step.id, stepLabel: step.data.label, field: 'outputVar', message: '输出变量格式不正确' }]
          : [{ stepId: step.id, stepLabel: step.data.label, field: 'outputVar', message: '输出变量不能为空' }]),
      ];
      if (!config.keyPath || String(config.keyPath).trim().length === 0) {
        errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'keyPath', message: '键路径不能为空' });
      }
      return errors;
    }
    case 'randomGet': {
      const canonical = getCanonicalDataStepConfig(config);
      return [
        ...(canonical.sourceVar
          ? isValidVariableName(canonical.sourceVar)
            ? []
            : [{ stepId: step.id, stepLabel: step.data.label, field: 'sourceVar', message: '数组变量格式不正确' }]
          : [{ stepId: step.id, stepLabel: step.data.label, field: 'sourceVar', message: '数组变量不能为空' }]),
        ...(canonical.outputVar
          ? isValidVariableName(canonical.outputVar)
            ? []
            : [{ stepId: step.id, stepLabel: step.data.label, field: 'outputVar', message: '输出变量格式不正确' }]
          : [{ stepId: step.id, stepLabel: step.data.label, field: 'outputVar', message: '输出变量不能为空' }]),
      ];
    }
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

function validateCallWorkflow(step: Step): ValidationError[] {
  const config = step.data.config as { workflowId?: string; inputMapping?: unknown; outputVar?: string; saveAs?: string };
  const errors: ValidationError[] = [];

  if (!config.workflowId || config.workflowId.trim().length === 0) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'workflowId', message: '目标模板不能为空' });
  }

  const outputVar = config.outputVar || config.saveAs;
  if (outputVar && !isValidVariableName(outputVar)) {
    errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'outputVar', message: '输出变量名格式不正确' });
  }

  if (config.inputMapping !== undefined) {
    if (!config.inputMapping || typeof config.inputMapping !== 'object' || Array.isArray(config.inputMapping)) {
      errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'inputMapping', message: '参数映射必须是对象' });
    } else {
      Object.entries(config.inputMapping as Record<string, unknown>).forEach(([key, value]) => {
        if (!isValidVariableName(key)) {
          errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'inputMapping', message: `映射键 ${key} 格式不正确` });
        }
        if (typeof value !== 'string' || !isValidVariableName(value)) {
          errors.push({ stepId: step.id, stepLabel: step.data.label, field: 'inputMapping', message: `映射值 ${key} 必须是有效变量名` });
        }
      });
    }
  }

  return errors;
}

function validateForEachElement(step: Step): ValidationError[] {
  const config = step.data.config as { selector?: string; elementRefVar?: string; itemVar?: string; indexVar?: string; body?: Step[]; extractType?: string; attributeName?: string };
  const errors = validateSelectorOrElementRefTarget(step);

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
    case 'keyboardPress':
    case 'keyboardHotkey':
    case 'textExtract':
    case 'goBack':
    case 'closeOtherPages':
      return validateSchemaStep(step);
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
    case 'callWorkflow':
      return validateCallWorkflow(step);
    case 'convertJson':
    case 'extractKey':
    case 'randomGet':
      return validateSchemaStep(step);
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
