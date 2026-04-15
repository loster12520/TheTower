import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Card, Form, Input, InputNumber, Radio, Select, Space, Switch, Tag, Typography, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { editorStore, NODE_TYPES } from '@/stores/editorStore';
import type { NodeType } from '@/stores/editorStore';
import { NODE_DEFINITION_MAP } from '@/models/stepRegistry';
import { templateApi } from '@/services/api';

const { Text } = Typography;

const TARGETABLE_NODE_TYPES = new Set<NodeType>(['click', 'type', 'extract', 'hover', 'focus', 'selectOption', 'uploadFiles']);
const ORDERABLE_NODE_TYPES = new Set<NodeType>(['click', 'type', 'extract', 'hover', 'focus', 'selectOption', 'uploadFiles', 'forEachElement']);

const getTargetMode = (config: Record<string, unknown>) => {
  return typeof config.elementRefVar === 'string' && config.elementRefVar.trim().length > 0 ? 'elementRef' : 'selector';
};

const getElementOrderMode = (config: Record<string, unknown>) => {
  const order = config.elementOrder as Record<string, unknown> | undefined;
  if (!order) {
    return 'first';
  }

  const type = typeof order.type === 'string' ? order.type : typeof order.mode === 'string' ? order.mode : 'first';
  return type === 'randomRange' ? 'randomRange' : type;
};

const applyElementTargetConfig = (targetConfig: Record<string, unknown>, values: Record<string, unknown>) => {
  const targetMode = values._targetMode === 'elementRef' ? 'elementRef' : 'selector';

  delete targetConfig.selector;
  delete targetConfig.elementRefVar;

  if (targetMode === 'elementRef') {
    const elementRefVar = typeof values.elementRefVar === 'string' ? values.elementRefVar.trim() : '';
    if (elementRefVar) {
      targetConfig.elementRefVar = elementRefVar;
    }
    return;
  }

  const selector = typeof values.selector === 'string' ? values.selector : '';
  if (selector.trim().length > 0) {
    targetConfig.selector = selector;
  }
};

const applyElementOrderConfig = (targetConfig: Record<string, unknown>, values: Record<string, unknown>) => {
  const orderMode = typeof values._elementOrderMode === 'string' ? values._elementOrderMode : 'first';

  if (orderMode === 'first') {
    delete targetConfig.elementOrder;
    return;
  }

  const order: Record<string, unknown> = { type: orderMode };
  if (orderMode === 'index' && values._elementOrderIndex !== undefined && values._elementOrderIndex !== null && values._elementOrderIndex !== '') {
    order.index = Number(values._elementOrderIndex);
  }

  if (orderMode === 'randomRange') {
    if (values._elementOrderMin !== undefined && values._elementOrderMin !== null && values._elementOrderMin !== '') {
      order.min = Number(values._elementOrderMin);
    }
    if (values._elementOrderMax !== undefined && values._elementOrderMax !== null && values._elementOrderMax !== '') {
      order.max = Number(values._elementOrderMax);
    }
  }

  targetConfig.elementOrder = order;
};

const conditionOperators = [
  { value: 'exists', label: '存在' },
  { value: 'notExists', label: '不存在' },
  { value: 'contains', label: '包含' },
  { value: 'notContains', label: '不包含' },
  { value: 'equals', label: '等于' },
  { value: 'notEquals', label: '不等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
];

const renderFieldLabel = (label: string, hint?: string, testId?: string) => {
  if (!hint) {
    return label;
  }

  return (
    <Space size={4} align="center">
      <span>{label}</span>
      <Tooltip title={hint}>
        <QuestionCircleOutlined className="editor-form-label__help" data-testid={testId} />
      </Tooltip>
    </Space>
  );
};

const getSchemaFieldHint = (type: NodeType, field: { name: string; label: string; extra?: string; placeholder?: string }) => {
  const scopedHints: Partial<Record<NodeType, Partial<Record<string, string>>>> = {
    textExtract: {
      input: '填写待匹配的原始文本，可直接引用上游变量。',
      pattern: '使用 JavaScript 正则表达式；如需提取括号内容，请写捕获组。',
      groupIndex: '0 表示完整匹配，1 表示第一个捕获组，依此类推。',
      saveAs: '提取结果会写入这个运行变量名。',
    },
    keyboardHotkey: {
      key: '填写主按键，例如 Enter、K、ArrowDown。',
      modifiers: '多个修饰键用逗号分隔，例如 Control,Shift。',
    },
    convertJson: {
      sourceVar: '填写已有运行变量名，系统会自动读取其内容进行转换。',
      outputVar: '转换后的结果会写入这个变量，供后续节点继续使用。',
    },
    extractKey: {
      sourceVar: '填写包含对象或数组的变量名。',
      keyPath: '支持点路径和数组下标，例如 data.items[0].title。',
      outputVar: '提取到的值会写入该变量。',
    },
    randomGet: {
      sourceVar: '填写数组变量名，系统会从其中随机取出一项。',
      outputVar: '随机结果会写入该变量。',
    },
  };

  const scopedHint = scopedHints[type]?.[field.name];
  if (scopedHint) {
    return scopedHint;
  }

  if (field.name === 'selector') {
    return '使用 CSS 选择器定位目标元素，建议优先选择稳定的 id 或 data 属性。';
  }

  if (field.name === 'saveAs' || field.name === 'outputVar' || field.label.includes('结果变量') || field.label.includes('输出变量')) {
    return '填写新的运行变量名，后续节点可通过 ${变量名} 继续引用。';
  }

  if (field.name === 'sourceVar' || field.label.includes('输入变量') || field.label.includes('数组变量') || field.label.includes('数据变量')) {
    return '填写已有运行变量名，不需要再包 ${}。';
  }

  return field.extra || (field.placeholder ? `示例：${field.placeholder}` : undefined);
};

// OpenUrl 配置
const OpenUrlConfig: React.FC<{ config: Record<string, unknown> }> = ({ config }) => {
  return (
    <Form.Item
      label="网址 URL"
      name="url"
      rules={[
        { required: true, message: '请输入 URL' },
        { type: 'url', message: '请输入有效的 URL' }
      ]}
      extra="例如: https://example.com"
    >
      <Input placeholder="https://example.com" />
    </Form.Item>
  );
};

// Click 配置
const ClickConfig: React.FC<{ config: Record<string, unknown> }> = ({ config }) => {
  return (
    <Form.Item
      label={renderFieldLabel('元素选择器', 'CSS 选择器，用于定位要点击的元素。建议优先使用稳定的 id、data-testid 或语义类名。', 'field-help-click-selector')}
      name="selector"
      rules={[{ required: true, message: '请输入元素选择器' }]}
      extra="例如: #submit-button, .login-btn"
    >
      <Input placeholder="#submit-button" />
    </Form.Item>
  );
};

// Type 配置
const TypeConfig: React.FC<{ config: Record<string, unknown> }> = ({ config }) => {
  return (
    <>
      <Form.Item
        label={renderFieldLabel('元素选择器', '使用 CSS 选择器定位输入框或文本域。', 'field-help-type-selector')}
        name="selector"
        rules={[{ required: true, message: '请输入元素选择器' }]}
        extra="例如: #username, input[name=email]"
      >
        <Input placeholder="#username" />
      </Form.Item>
      <Form.Item
        label={renderFieldLabel('输入文本', '支持直接填写文本，也可以引用上游变量值。', 'field-help-type-text')}
        name="text"
        rules={[{ required: true, message: '请输入文本内容' }]}
      >
        <Input.TextArea rows={2} placeholder="要输入的文本内容" />
      </Form.Item>
    </>
  );
};

// WaitFor 配置
const WaitForConfig: React.FC<{ config: Record<string, unknown> }> = ({ config }) => {
  const hasSelector = config.selector && String(config.selector).length > 0;
  const hasWaitMs = config.waitMs !== undefined && config.waitMs !== null;
  const initialType = hasSelector ? 'selector' : hasWaitMs ? 'time' : 'selector';

  return (
    <>
      <Form.Item label="等待方式" name="_waitType" initialValue={initialType}>
        <Radio.Group>
          <Radio.Button value="selector">等待元素</Radio.Button>
          <Radio.Button value="time">固定时间</Radio.Button>
        </Radio.Group>
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(prev, curr) => prev._waitType !== curr._waitType}>
        {({ getFieldValue }) => {
          const type = getFieldValue('_waitType');
          return type === 'selector' ? (
            <Form.Item
              label="元素选择器"
              name="selector"
              rules={[{ required: true, message: '请输入元素选择器' }]}
              extra="等待该元素出现在页面上"
            >
              <Input placeholder="#result, .loading-complete" />
            </Form.Item>
          ) : (
            <Form.Item
              label="等待时间（毫秒）"
              name="waitMs"
              rules={[{ required: true, message: '请输入等待时间' }]}
              extra="最大 5 分钟（300000ms）"
            >
              <Input type="number" placeholder="1000" addonAfter="ms" />
            </Form.Item>
          );
        }}
      </Form.Item>
    </>
  );
};

// Extract 配置
const ExtractConfig: React.FC<{ config: Record<string, unknown> }> = ({ config }) => {
  return (
    <>
      <Form.Item
        label={renderFieldLabel('元素选择器', '定位需要提取内容的 DOM 元素。', 'field-help-extract-selector')}
        name="selector"
        rules={[{ required: true, message: '请输入元素选择器' }]}
        extra="例如: h1, .price, #article-content"
      >
        <Input placeholder="h1" />
      </Form.Item>

      <Form.Item
        label={renderFieldLabel('变量名', '提取结果会写入该变量，后续步骤可用 ${变量名} 引用。', 'field-help-extract-variable')}
        name="as"
        rules={[
          { required: true, message: '请输入变量名' },
          { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: '以字母或下划线开头' }
        ]}
        extra="用于存储提取的数据"
      >
        <Input placeholder="title, price, content" />
      </Form.Item>

      <Form.Item label={renderFieldLabel('提取方式', '文本内容用于读取可见文本；属性值用于读取 href、src 等属性。', 'field-help-extract-mode')} name="mode" initialValue={config.mode || 'text'}>
        <Radio.Group>
          <Radio.Button value="text">文本内容</Radio.Button>
          <Radio.Button value="attribute">属性值</Radio.Button>
        </Radio.Group>
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(prev, curr) => prev.mode !== curr.mode}>
        {({ getFieldValue }) => {
          return getFieldValue('mode') === 'attribute' ? (
            <Form.Item
              label={renderFieldLabel('属性名', '当提取方式为属性值时必填，例如 href、src、data-id。', 'field-help-extract-attribute')}
              name="attributeName"
              rules={[{ required: true, message: '请输入属性名' }]}
              extra="例如: href, src, data-id"
            >
              <Input placeholder="href" />
            </Form.Item>
          ) : null;
        }}
      </Form.Item>
    </>
  );
};

const BranchSummary: React.FC<{ label: string; count: number }> = ({ label, count }) => (
  <Tag color="blue">{label} {count}</Tag>
);

const IfConfig: React.FC<{ config: Record<string, unknown> }> = ({ config }) => {
  const thenCount = Array.isArray(config.then) ? config.then.length : 0;
  const elseCount = Array.isArray(config.else) ? config.else.length : 0;
  const nodeId = editorStore.selectedNode?.id;
  const activeBranch = editorStore.activeSubflow?.nodeId === nodeId ? editorStore.activeSubflow.branch : null;

  return (
    <>
      <Alert
        type="info"
        showIcon
        message="当前支持节点内缩略 subflow 预览，并可进入 THEN / ELSE 子流程继续编辑。"
        style={{ marginBottom: 16 }}
      />
      <Form.Item label={renderFieldLabel('条件左值', '通常填写变量引用或固定文本，例如 ${token}。', 'field-help-condition-left')} name={['condition', 'left']} rules={[{ required: true, message: '请输入条件左值' }]}>
        <Input placeholder="例如：${token}" />
      </Form.Item>
      <Form.Item label={renderFieldLabel('条件操作符', 'exists / notExists 只判断左值是否存在，其他操作符会比较左右两侧。', 'field-help-condition-op')} name={['condition', 'op']} initialValue="exists" rules={[{ required: true, message: '请选择条件操作符' }]}>
        <Select options={conditionOperators} />
      </Form.Item>
      <Form.Item label={renderFieldLabel('条件右值', '作为比较目标；当操作符为 exists / notExists 时可留空。', 'field-help-condition-right')} name={['condition', 'right']} extra="exists / notExists 可留空">
        <Input placeholder="例如：success" />
      </Form.Item>
      <Space wrap>
        <BranchSummary label="THEN" count={thenCount} />
        <BranchSummary label="ELSE" count={elseCount} />
      </Space>
      <Space wrap style={{ marginTop: 12 }}>
        <Button type={activeBranch === 'then' ? 'primary' : 'default'} onClick={() => nodeId && editorStore.enterSubflow(nodeId, 'then')}>
          编辑 THEN
        </Button>
        <Button type={activeBranch === 'else' ? 'primary' : 'default'} onClick={() => nodeId && editorStore.enterSubflow(nodeId, 'else')}>
          编辑 ELSE
        </Button>
      </Space>
    </>
  );
};

const ForTimesConfig: React.FC<{ config: Record<string, unknown> }> = ({ config }) => {
  const bodyCount = Array.isArray(config.body) ? config.body.length : 0;
  const nodeId = editorStore.selectedNode?.id;
  const isActive = editorStore.activeSubflow?.nodeId === nodeId && editorStore.activeSubflow.branch === 'body';

  return (
    <>
      <Alert
        type="info"
        showIcon
        message="当前支持节点内 BODY 缩略预览，并可进入子流程画布编辑循环体。"
        style={{ marginBottom: 16 }}
      />
      <Form.Item label="循环次数" name="times" rules={[{ required: true, message: '请输入循环次数' }]}>
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="索引变量名" name="indexVar" extra="例如：index">
        <Input placeholder="index" />
      </Form.Item>
      <Space wrap>
        <BranchSummary label="BODY" count={bodyCount} />
      </Space>
      <Space wrap style={{ marginTop: 12 }}>
        <Button type={isActive ? 'primary' : 'default'} onClick={() => nodeId && editorStore.enterSubflow(nodeId, 'body')}>
          编辑 BODY
        </Button>
      </Space>
    </>
  );
};

const WhileConfig: React.FC<{ config: Record<string, unknown> }> = ({ config }) => {
  const bodyCount = Array.isArray(config.body) ? config.body.length : 0;
  const nodeId = editorStore.selectedNode?.id;
  const isActive = editorStore.activeSubflow?.nodeId === nodeId && editorStore.activeSubflow.branch === 'body';

  return (
    <>
      <Alert
        type="info"
        showIcon
        message="当前支持节点内 BODY 缩略预览，并可进入子流程画布编辑循环体。"
        style={{ marginBottom: 16 }}
      />
      <Form.Item label={renderFieldLabel('条件左值', '通常填写变量引用或计数值，例如 ${count}。', 'field-help-while-condition-left')} name={['condition', 'left']} rules={[{ required: true, message: '请输入条件左值' }]}>
        <Input placeholder="例如：${count}" />
      </Form.Item>
      <Form.Item label={renderFieldLabel('条件操作符', '循环条件每次执行前都会重新判断。', 'field-help-while-condition-op')} name={['condition', 'op']} initialValue="exists" rules={[{ required: true, message: '请选择条件操作符' }]}>
        <Select options={conditionOperators} />
      </Form.Item>
      <Form.Item label={renderFieldLabel('条件右值', '用于和左值比较，通常填阈值或目标状态。', 'field-help-while-condition-right')} name={['condition', 'right']}>
        <Input placeholder="例如：10" />
      </Form.Item>
      <Form.Item label="最大循环次数" name="maxIterations" rules={[{ required: true, message: '请输入最大循环次数' }]}>
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Space wrap>
        <BranchSummary label="BODY" count={bodyCount} />
      </Space>
      <Space wrap style={{ marginTop: 12 }}>
        <Button type={isActive ? 'primary' : 'default'} onClick={() => nodeId && editorStore.enterSubflow(nodeId, 'body')}>
          编辑 BODY
        </Button>
      </Space>
    </>
  );
};

const BreakConfig: React.FC<{ config: Record<string, unknown> }> = () => (
  <Alert type="warning" showIcon message="退出循环节点只应放在循环 BODY 中；当前前端将在运行前校验其位置。" />
);

const ForEachElementConfig: React.FC<{ config: Record<string, unknown> }> = ({ config }) => {
  const bodyCount = Array.isArray(config.body) ? config.body.length : 0;
  const nodeId = editorStore.selectedNode?.id;
  const isActive = editorStore.activeSubflow?.nodeId === nodeId && editorStore.activeSubflow.branch === 'body';

  return (
    <>
      <Alert type="info" showIcon message="遍历命中的元素集合，并在 BODY 中执行子流程。" style={{ marginBottom: 16 }} />
      <ElementTargetConfig />
      <Form.Item label="项变量名" name="itemVar" rules={[{ required: true, message: '请输入项变量名' }]}>
        <Input placeholder="item" />
      </Form.Item>
      <Form.Item label="索引变量名" name="indexVar">
        <Input placeholder="index" />
      </Form.Item>
      <Form.Item label="提取方式" name="extractType" initialValue={config.extractType || 'text'}>
        <Select options={[{ label: '文本', value: 'text' }, { label: '属性', value: 'attribute' }, { label: 'HTML', value: 'html' }]} />
      </Form.Item>
      <Form.Item label="属性名" name="attributeName">
        <Input placeholder="href" />
      </Form.Item>
      <Space wrap>
        <BranchSummary label="BODY" count={bodyCount} />
      </Space>
      <Space wrap style={{ marginTop: 12 }}>
        <Button type={isActive ? 'primary' : 'default'} onClick={() => nodeId && editorStore.enterSubflow(nodeId, 'body')}>
          编辑 BODY
        </Button>
      </Space>
    </>
  );
};

const ForEachDataConfig: React.FC<{ config: Record<string, unknown> }> = ({ config }) => {
  const bodyCount = Array.isArray(config.body) ? config.body.length : 0;
  const nodeId = editorStore.selectedNode?.id;
  const isActive = editorStore.activeSubflow?.nodeId === nodeId && editorStore.activeSubflow.branch === 'body';

  return (
    <>
      <Alert type="info" showIcon message="遍历运行变量中的数据项，并在 BODY 中执行子流程。" style={{ marginBottom: 16 }} />
      <Form.Item label={renderFieldLabel('数据变量名', '填写待遍历的数据变量名，不需要再包 ${}。', 'field-help-foreachdata-datavariable')} name="dataVar" rules={[{ required: true, message: '请输入数据变量名' }]}>
        <Input placeholder="items" />
      </Form.Item>
      <Form.Item label={renderFieldLabel('项变量名', '每次循环当前项都会写入这个变量。', 'field-help-foreachdata-itemvariable')} name="itemVar" rules={[{ required: true, message: '请输入项变量名' }]}>
        <Input placeholder="item" />
      </Form.Item>
      <Form.Item label={renderFieldLabel('索引变量名', '可选；每轮循环的序号会写入该变量。', 'field-help-foreachdata-indexvariable')} name="indexVar">
        <Input placeholder="index" />
      </Form.Item>
      <Space wrap>
        <BranchSummary label="BODY" count={bodyCount} />
      </Space>
      <Space wrap style={{ marginTop: 12 }}>
        <Button type={isActive ? 'primary' : 'default'} onClick={() => nodeId && editorStore.enterSubflow(nodeId, 'body')}>
          编辑 BODY
        </Button>
      </Space>
    </>
  );
};

const StartBrowserConfig: React.FC<{ config: Record<string, unknown> }> = ({ config }) => {
  const bodyCount = Array.isArray(config.body) ? config.body.length : 0;
  const nodeId = editorStore.selectedNode?.id;
  const isActive = editorStore.activeSubflow?.nodeId === nodeId && editorStore.activeSubflow.branch === 'body';

  return (
    <>
      <Alert type="info" showIcon message="创建独立浏览器上下文，BODY 中的步骤将运行在该上下文内。" style={{ marginBottom: 16 }} />
      <Form.Item label="环境序列号" name="envSerial">
        <Input placeholder="预留字段，可留空" />
      </Form.Item>
      <Form.Item label="错误处理" name="onError" initialValue={config.onError || 'abort'}>
        <Select options={[{ label: '终止', value: 'abort' }, { label: '跳过', value: 'skip' }]} />
      </Form.Item>
      <Form.Item label="完成后处理" name="onComplete" initialValue={config.onComplete || 'close'}>
        <Select options={[{ label: '关闭上下文', value: 'close' }, { label: '保留上下文', value: 'keep' }]} />
      </Form.Item>
      <Space wrap>
        <BranchSummary label="BODY" count={bodyCount} />
      </Space>
      <Space wrap style={{ marginTop: 12 }}>
        <Button type={isActive ? 'primary' : 'default'} onClick={() => nodeId && editorStore.enterSubflow(nodeId, 'body')}>
          编辑 BODY
        </Button>
      </Space>
    </>
  );
};

const CallWorkflowConfig: React.FC<{ config: Record<string, unknown> }> = () => {
  const [templates, setTemplates] = React.useState<Array<{ label: string; value: string }>>([]);

  useEffect(() => {
    let disposed = false;
    templateApi.list().then((response) => {
      if (disposed) {
        return;
      }

      setTemplates(response.data.items.map((item) => ({
        label: `${item.name} (${item.id.slice(-6)})`,
        value: item.id,
      })));
    }).catch(() => {
      if (!disposed) {
        setTemplates([]);
      }
    });

    return () => {
      disposed = true;
    };
  }, []);

  return (
    <>
      <Alert type="info" showIcon message="调用另一个模板执行，并把子流程输出增量写回当前流程。" style={{ marginBottom: 16 }} />
      <Form.Item label={renderFieldLabel('目标模板', '优先从列表选择，避免手填 ID 出错。', 'field-help-callworkflow-target')} name="workflowId" rules={[{ required: true, message: '请选择目标模板' }]}>
        <Select
          showSearch
          placeholder="选择要调用的模板"
          options={templates}
          optionFilterProp="label"
        />
      </Form.Item>
      <Form.Item label={renderFieldLabel('模板 ID（手动）', '只有列表里找不到目标模板时才建议手填。', 'field-help-callworkflow-manualid')} name="_workflowIdManual" extra="无法从列表中找到时，可直接填写模板 ID。">
        <Input placeholder="template_xxx" />
      </Form.Item>
      <Form.Item label={renderFieldLabel('参数映射 JSON', '键表示子流程入参名，值表示当前流程里的变量名。', 'field-help-callworkflow-mapping')} name="_inputMappingText" extra="例如：{&quot;token&quot;:&quot;sessionToken&quot;,&quot;account&quot;:&quot;activeAccount&quot;}">
        <Input.TextArea rows={4} placeholder='{"token":"sessionToken"}' />
      </Form.Item>
      <Form.Item label={renderFieldLabel('结果变量', '子流程返回的输出增量会整体写入该变量。', 'field-help-callworkflow-output')} name="outputVar" extra="子流程输出增量将写入该变量。">
        <Input placeholder="subflowResult" />
      </Form.Item>
    </>
  );
};

const ElementTargetConfig: React.FC = () => {
  return (
    <>
      <Form.Item label={renderFieldLabel('定位来源', '选择直接用选择器定位，或复用上游节点产出的元素引用。', 'field-help-target-mode')} name="_targetMode" initialValue="selector">
        <Radio.Group>
          <Radio.Button value="selector">元素选择器</Radio.Button>
          <Radio.Button value="elementRef">元素引用变量</Radio.Button>
        </Radio.Group>
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(prev, curr) => prev._targetMode !== curr._targetMode}>
        {({ getFieldValue }) => {
          const mode = getFieldValue('_targetMode');
          return mode === 'elementRef' ? (
            <Form.Item label={renderFieldLabel('元素引用变量', '填写上游 extract 或 forEachElement 产出的元素引用变量名。', 'field-help-target-elementref')} name="elementRefVar" extra="填写上游 extract 或 forEachElement 产出的元素引用变量名。">
              <Input placeholder="itemRef" />
            </Form.Item>
          ) : (
            <Form.Item label={renderFieldLabel('元素选择器', '使用 CSS 选择器命中元素集合，再结合下方顺序规则确定目标。', 'field-help-target-selector')} name="selector" rules={[{ required: true, message: '请输入元素选择器' }]} extra="例如: #submit-button, .card-item">
              <Input placeholder="#submit-button" />
            </Form.Item>
          );
        }}
      </Form.Item>

      <Form.Item label={renderFieldLabel('命中元素顺序', '当选择器命中多个元素时，指定最终使用哪一个。', 'field-help-target-order-mode')} name="_elementOrderMode" initialValue="first" extra="当命中多个元素时，指定使用哪一个。">
        <Select
          options={[
            { label: '第一个', value: 'first' },
            { label: '最后一个', value: 'last' },
            { label: '固定序号', value: 'index' },
            { label: '随机一个', value: 'random' },
            { label: '随机范围', value: 'randomRange' },
          ]}
        />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(prev, curr) => prev._elementOrderMode !== curr._elementOrderMode}>
        {({ getFieldValue }) => {
          const orderMode = getFieldValue('_elementOrderMode');
          if (orderMode === 'index') {
            return (
              <Form.Item label={renderFieldLabel('元素序号', '从 0 开始计数，例如 0 表示第一个元素。', 'field-help-target-order-index')} name="_elementOrderIndex" extra="从 0 开始计数。">
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            );
          }

          if (orderMode === 'randomRange') {
            return (
              <>
                <Form.Item label={renderFieldLabel('最小序号', '随机范围的起点，包含该值。', 'field-help-target-order-min')} name="_elementOrderMin" extra="从 0 开始计数。">
                  <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item label={renderFieldLabel('最大序号', '随机范围的终点；超出命中数量时后端会自动截断。', 'field-help-target-order-max')} name="_elementOrderMax" extra="超出范围时后端会自动截断。">
                  <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                </Form.Item>
              </>
            );
          }

          return null;
        }}
      </Form.Item>
    </>
  );
};

const SchemaConfig: React.FC<{ type: NodeType }> = ({ type }) => {
  const definition = NODE_DEFINITION_MAP[type];
  if (!definition?.fields || definition.fields.length === 0) {
    return null;
  }

  return (
    <>
      {TARGETABLE_NODE_TYPES.has(type) && <ElementTargetConfig />}
      {definition.fields.map((field) => {
        if (TARGETABLE_NODE_TYPES.has(type) && field.name === 'selector') {
          return null;
        }

        const rules = field.required ? [{ required: true, message: `请输入${field.label}` }] : undefined;

        switch (field.type) {
          case 'textarea':
            return (
              <Form.Item key={field.name} label={renderFieldLabel(field.label, getSchemaFieldHint(type, field), `field-help-${type}-${field.name}`)} name={field.name} rules={rules} extra={field.extra}>
                <Input.TextArea rows={3} placeholder={field.placeholder} />
              </Form.Item>
            );
          case 'number':
            return (
              <Form.Item key={field.name} label={renderFieldLabel(field.label, getSchemaFieldHint(type, field), `field-help-${type}-${field.name}`)} name={field.name} rules={rules} extra={field.extra}>
                <InputNumber min={field.min} max={field.max} style={{ width: '100%' }} placeholder={field.placeholder} />
              </Form.Item>
            );
          case 'select':
            return (
              <Form.Item key={field.name} label={renderFieldLabel(field.label, getSchemaFieldHint(type, field), `field-help-${type}-${field.name}`)} name={field.name} rules={rules} extra={field.extra}>
                <Select options={field.options} placeholder={field.placeholder} />
              </Form.Item>
            );
          case 'radio':
            return (
              <Form.Item key={field.name} label={renderFieldLabel(field.label, getSchemaFieldHint(type, field), `field-help-${type}-${field.name}`)} name={field.name} rules={rules} extra={field.extra}>
                <Radio.Group optionType="button" buttonStyle="solid" options={field.options} />
              </Form.Item>
            );
          default:
            return (
              <Form.Item key={field.name} label={renderFieldLabel(field.label, getSchemaFieldHint(type, field), `field-help-${type}-${field.name}`)} name={field.name} rules={rules} extra={field.extra}>
                <Input placeholder={field.placeholder} />
              </Form.Item>
            );
        }
      })}
    </>
  );
};

// 配置组件映射
const configComponents: Partial<Record<NodeType, React.FC<{ config: Record<string, unknown> }>>> = {
  if: IfConfig,
  forTimes: ForTimesConfig,
  while: WhileConfig,
  forEachElement: ForEachElementConfig,
  forEachData: ForEachDataConfig,
  startBrowser: StartBrowserConfig,
  break: BreakConfig,
  callWorkflow: CallWorkflowConfig,
};

// 主配置面板
const NodeConfigPanel: React.FC = observer(() => {
  const [form] = Form.useForm();
  const node = editorStore.selectedNode;

  const extractVariableRef = React.useCallback((value: unknown): string => {
    if (typeof value !== 'string') {
      return '';
    }

    const match = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value.trim());
    return match?.[1] ?? '';
  }, []);

  // 节点变化时更新表单
  useEffect(() => {
    if (node) {
      const values: Record<string, unknown> = {
        label: node.data.label,
        breakpoint: node.data.config?.breakpoint === true,
        ...node.data.config,
      };
      if (node.type === 'callWorkflow') {
        values._inputMappingText = node.data.config?.inputMapping
          ? JSON.stringify(node.data.config.inputMapping, null, 2)
          : '';
        values._workflowIdManual = node.data.config?.workflowId || '';
      }
      if (node.type === 'convertJson') {
        values.sourceVar = node.data.config?.sourceVar
          || extractVariableRef(node.data.config?.value)
          || '';
        values.targetFormat = node.data.config?.targetFormat
          || (node.data.config?.direction === 'stringify' ? 'string' : 'object');
        values.outputVar = node.data.config?.outputVar || node.data.config?.saveAs || '';
      }
      if (node.type === 'extractKey' || node.type === 'randomGet') {
        values.sourceVar = node.data.config?.sourceVar || node.data.config?.inputVar || '';
        values.outputVar = node.data.config?.outputVar || node.data.config?.saveAs || '';
      }
      if (node.type === 'keyboardHotkey') {
        values.modifiers = Array.isArray(node.data.config?.modifiers)
          ? node.data.config.modifiers.join(', ')
          : node.data.config?.modifiers || '';
      }
      if (TARGETABLE_NODE_TYPES.has(node.type as NodeType) || node.type === 'forEachElement') {
        values._targetMode = getTargetMode(node.data.config as Record<string, unknown>);
      }
      if (ORDERABLE_NODE_TYPES.has(node.type as NodeType)) {
        const elementOrder = node.data.config?.elementOrder as Record<string, unknown> | undefined;
        values._elementOrderMode = getElementOrderMode(node.data.config as Record<string, unknown>);
        values._elementOrderIndex = elementOrder?.index;
        values._elementOrderMin = elementOrder?.min;
        values._elementOrderMax = elementOrder?.max;
      }
      form.resetFields();
      form.setFieldsValue(values);
    }
  }, [extractVariableRef, node?.id, form]);

  // 表单值变化时更新节点
  const handleValuesChange = (changedValues: Record<string, unknown>) => {
    if (!node) return;

    const newData = { ...node.data };

    if (changedValues.label !== undefined) {
      newData.label = changedValues.label;
    }

    Object.keys(changedValues).forEach(key => {
      if (key !== 'label' && !key.startsWith('_')) {
        if (changedValues[key] === undefined || changedValues[key] === '') {
          delete newData.config[key];
        } else {
          newData.config[key] = changedValues[key];
        }
      }
    });

    const allValues = form.getFieldsValue(true) as Record<string, unknown>;
    if (allValues.condition && typeof allValues.condition === 'object') {
      newData.config.condition = allValues.condition as Record<string, unknown>;
    }

    if (allValues.breakpointCondition && typeof allValues.breakpointCondition === 'object') {
      const breakpointCondition = allValues.breakpointCondition as Record<string, unknown>;
      const hasMeaningfulCondition = typeof breakpointCondition.left === 'string' && breakpointCondition.left.trim().length > 0;
      if (hasMeaningfulCondition) {
        newData.config.breakpointCondition = breakpointCondition;
      } else {
        delete newData.config.breakpointCondition;
      }
    }

    if (allValues.breakpoint !== true) {
      delete newData.config.breakpointCondition;
    }

    if (node.type === 'waitFor' && changedValues._waitType) {
      if (changedValues._waitType === 'selector') {
        delete newData.config.waitMs;
      } else {
        delete newData.config.selector;
      }
    }

    if (node.type === 'callWorkflow') {
      const allValues = form.getFieldsValue(true) as Record<string, unknown>;
      const workflowIdManual = typeof allValues._workflowIdManual === 'string' ? allValues._workflowIdManual.trim() : '';
      if (workflowIdManual) {
        newData.config.workflowId = workflowIdManual;
      }

      const inputMappingText = typeof allValues._inputMappingText === 'string' ? allValues._inputMappingText.trim() : '';
      if (!inputMappingText) {
        delete newData.config.inputMapping;
      } else {
        try {
          const parsed = JSON.parse(inputMappingText) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            newData.config.inputMapping = parsed as Record<string, unknown>;
          }
        } catch {
          // 保留已有配置，等待用户输入完整 JSON 后再更新。
        }
      }
    }

    if (node.type === 'keyboardHotkey') {
      const modifiers = typeof allValues.modifiers === 'string'
        ? allValues.modifiers.split(',').map((item) => item.trim()).filter((item) => item.length > 0)
        : [];

      if (modifiers.length > 0) {
        newData.config.modifiers = modifiers;
      } else {
        delete newData.config.modifiers;
      }
    }

    if (TARGETABLE_NODE_TYPES.has(node.type as NodeType) || node.type === 'forEachElement') {
      applyElementTargetConfig(newData.config, allValues);
    }

    if (ORDERABLE_NODE_TYPES.has(node.type as NodeType)) {
      applyElementOrderConfig(newData.config, allValues);
    }

    if (node.type === 'convertJson') {
      const sourceVar = typeof allValues.sourceVar === 'string' ? allValues.sourceVar.trim() : '';
      const outputVar = typeof allValues.outputVar === 'string' ? allValues.outputVar.trim() : '';
      const targetFormat = allValues.targetFormat === 'string' ? 'string' : 'object';

      delete newData.config.sourceVar;
      delete newData.config.inputVar;
      delete newData.config.targetFormat;
      delete newData.config.outputVar;

      if (sourceVar) {
        newData.config.value = `\${${sourceVar}}`;
      } else {
        delete newData.config.value;
      }

      newData.config.direction = targetFormat === 'string' ? 'stringify' : 'parse';

      if (outputVar) {
        newData.config.saveAs = outputVar;
      } else {
        delete newData.config.saveAs;
      }
    }

    if (node.type === 'extractKey' || node.type === 'randomGet') {
      const sourceVar = typeof allValues.sourceVar === 'string' ? allValues.sourceVar.trim() : '';
      const outputVar = typeof allValues.outputVar === 'string' ? allValues.outputVar.trim() : '';

      delete newData.config.sourceVar;
      delete newData.config.outputVar;

      if (sourceVar) {
        newData.config.inputVar = sourceVar;
      } else {
        delete newData.config.inputVar;
      }

      if (outputVar) {
        newData.config.saveAs = outputVar;
      } else {
        delete newData.config.saveAs;
      }
    }

    editorStore.updateNodeData(node.id, newData);
  };

  if (!node) {
    return (
      <Card title="属性配置" size="small">
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🖱️</div>
          <Text>点击画布中的节点<br />查看和编辑属性</Text>
        </div>
      </Card>
    );
  }

  const nodeType = NODE_TYPES.find(n => n.type === node.type as NodeType);
  const ConfigComponent = configComponents[node.type as NodeType];
  const definition = NODE_DEFINITION_MAP[node.type as NodeType];
  const activeScopeMatches = editorStore.activeSubflow?.nodeId === node.id;

  return (
    <Card
      title={
        <Space>
          <span style={{ fontSize: 18 }}>{nodeType?.icon}</span>
          <span>{nodeType?.label}</span>
        </Space>
      }
      size="small"
      styles={{ header: { background: nodeType?.color, color: '#fff' } }}
    >
      {activeScopeMatches && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 12 }}
          message={`当前正在编辑子流程：${editorStore.canvasScopeLabel}`}
        />
      )}
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        autoComplete="off"
        size="small"
      >
        <Form.Item
          label="节点名称"
          name="label"
          rules={[{ required: true, message: '请输入节点名称' }]}
        >
          <Input placeholder="节点名称" />
        </Form.Item>

        <Form.Item label="断点" name="breakpoint" valuePropName="checked" extra="调试运行命中该节点前会暂停。">
          <Switch checkedChildren="已开启" unCheckedChildren="关闭" />
        </Form.Item>

        <Form.Item noStyle shouldUpdate={(prev, curr) => prev.breakpoint !== curr.breakpoint}>
          {({ getFieldValue }) => getFieldValue('breakpoint') ? (
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Text strong>条件断点</Text>
                <Text type="secondary">可选。仅当条件满足时才会在该节点前暂停，未填写则保持普通断点行为。</Text>
                <Form.Item label="条件左值" name={['breakpointCondition', 'left']} extra="例如：${token}、${count} 或固定文本。">
                  <Input placeholder="例如：${token}" />
                </Form.Item>
                <Form.Item label="条件操作符" name={['breakpointCondition', 'op']} initialValue="exists">
                  <Select options={conditionOperators} />
                </Form.Item>
                <Form.Item label="条件右值" name={['breakpointCondition', 'right']} extra="exists / notExists 可留空。">
                  <Input placeholder="例如：success" />
                </Form.Item>
              </Space>
            </Card>
          ) : null}
        </Form.Item>

        {ConfigComponent ? <ConfigComponent config={node.data.config} /> : definition?.formType === 'schema' ? <SchemaConfig type={node.type as NodeType} /> : null}
      </Form>
    </Card>
  );
});

export default NodeConfigPanel;
