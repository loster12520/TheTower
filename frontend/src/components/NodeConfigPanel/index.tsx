import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Form, Input, Radio, Card, Space, Typography, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { editorStore, NODE_TYPES } from '@/stores/editorStore';
import type { NodeType } from '@/stores/editorStore';

const { Text } = Typography;

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

// 配置组件映射
const configComponents: Record<NodeType, React.FC<{ config: Record<string, unknown> }>> = {
  openUrl: OpenUrlConfig,
  click: ClickConfig,
  type: TypeConfig,
  waitFor: WaitForConfig,
  extract: ExtractConfig,
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

        {ConfigComponent && <ConfigComponent config={node.data.config} />}
      </Form>
    </Card>
  );
});

export default NodeConfigPanel;
