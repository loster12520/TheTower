import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Card, Form, Input, InputNumber, Radio, Select, Space, Tag, Typography, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { editorStore, NODE_TYPES } from '@/stores/editorStore';
import type { NodeType } from '@/stores/editorStore';
import { NODE_DEFINITION_MAP } from '@/models/stepRegistry';

const { Text } = Typography;

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
      label={
        <Space>
          元素选择器
          <Tooltip title="CSS 选择器，用于定位要点击的元素">
            <QuestionCircleOutlined />
          </Tooltip>
        </Space>
      }
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
        label="元素选择器"
        name="selector"
        rules={[{ required: true, message: '请输入元素选择器' }]}
        extra="例如: #username, input[name=email]"
      >
        <Input placeholder="#username" />
      </Form.Item>
      <Form.Item
        label="输入文本"
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
        label="元素选择器"
        name="selector"
        rules={[{ required: true, message: '请输入元素选择器' }]}
        extra="例如: h1, .price, #article-content"
      >
        <Input placeholder="h1" />
      </Form.Item>

      <Form.Item
        label="变量名"
        name="as"
        rules={[
          { required: true, message: '请输入变量名' },
          { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: '以字母或下划线开头' }
        ]}
        extra="用于存储提取的数据"
      >
        <Input placeholder="title, price, content" />
      </Form.Item>

      <Form.Item label="提取方式" name="mode" initialValue={config.mode || 'text'}>
        <Radio.Group>
          <Radio.Button value="text">文本内容</Radio.Button>
          <Radio.Button value="attribute">属性值</Radio.Button>
        </Radio.Group>
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(prev, curr) => prev.mode !== curr.mode}>
        {({ getFieldValue }) => {
          return getFieldValue('mode') === 'attribute' ? (
            <Form.Item
              label="属性名"
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
      <Form.Item label="条件左值" name={['condition', 'left']} rules={[{ required: true, message: '请输入条件左值' }]}>
        <Input placeholder="例如：${token}" />
      </Form.Item>
      <Form.Item label="条件操作符" name={['condition', 'op']} initialValue="exists" rules={[{ required: true, message: '请选择条件操作符' }]}>
        <Select options={conditionOperators} />
      </Form.Item>
      <Form.Item label="条件右值" name={['condition', 'right']} extra="exists / notExists 可留空">
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
      <Form.Item label="条件左值" name={['condition', 'left']} rules={[{ required: true, message: '请输入条件左值' }]}>
        <Input placeholder="例如：${count}" />
      </Form.Item>
      <Form.Item label="条件操作符" name={['condition', 'op']} initialValue="exists" rules={[{ required: true, message: '请选择条件操作符' }]}>
        <Select options={conditionOperators} />
      </Form.Item>
      <Form.Item label="条件右值" name={['condition', 'right']}>
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
      <Form.Item label="元素选择器" name="selector" rules={[{ required: true, message: '请输入元素选择器' }]}>
        <Input placeholder=".item-card" />
      </Form.Item>
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
      <Form.Item label="数据变量名" name="dataVar" rules={[{ required: true, message: '请输入数据变量名' }]}>
        <Input placeholder="items" />
      </Form.Item>
      <Form.Item label="项变量名" name="itemVar" rules={[{ required: true, message: '请输入项变量名' }]}>
        <Input placeholder="item" />
      </Form.Item>
      <Form.Item label="索引变量名" name="indexVar">
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

const SchemaConfig: React.FC<{ type: NodeType }> = ({ type }) => {
  const definition = NODE_DEFINITION_MAP[type];
  if (!definition?.fields || definition.fields.length === 0) {
    return null;
  }

  return (
    <>
      {definition.fields.map((field) => {
        const rules = field.required ? [{ required: true, message: `请输入${field.label}` }] : undefined;

        switch (field.type) {
          case 'textarea':
            return (
              <Form.Item key={field.name} label={field.label} name={field.name} rules={rules} extra={field.extra}>
                <Input.TextArea rows={3} placeholder={field.placeholder} />
              </Form.Item>
            );
          case 'number':
            return (
              <Form.Item key={field.name} label={field.label} name={field.name} rules={rules} extra={field.extra}>
                <InputNumber min={field.min} max={field.max} style={{ width: '100%' }} placeholder={field.placeholder} />
              </Form.Item>
            );
          case 'select':
            return (
              <Form.Item key={field.name} label={field.label} name={field.name} rules={rules} extra={field.extra}>
                <Select options={field.options} placeholder={field.placeholder} />
              </Form.Item>
            );
          case 'radio':
            return (
              <Form.Item key={field.name} label={field.label} name={field.name} rules={rules} extra={field.extra}>
                <Radio.Group optionType="button" buttonStyle="solid" options={field.options} />
              </Form.Item>
            );
          default:
            return (
              <Form.Item key={field.name} label={field.label} name={field.name} rules={rules} extra={field.extra}>
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
};

// 主配置面板
const NodeConfigPanel: React.FC = observer(() => {
  const [form] = Form.useForm();
  const node = editorStore.selectedNode;

  // 节点变化时更新表单
  useEffect(() => {
    if (node) {
      const values: Record<string, unknown> = {
        label: node.data.label,
        ...node.data.config,
      };
      form.resetFields();
      form.setFieldsValue(values);
    }
  }, [node?.id, form]);

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

    if (node.type === 'waitFor' && changedValues._waitType) {
      if (changedValues._waitType === 'selector') {
        delete newData.config.waitMs;
      } else {
        delete newData.config.selector;
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

        {ConfigComponent ? <ConfigComponent config={node.data.config} /> : definition?.formType === 'schema' ? <SchemaConfig type={node.type as NodeType} /> : null}
      </Form>
    </Card>
  );
});

export default NodeConfigPanel;
