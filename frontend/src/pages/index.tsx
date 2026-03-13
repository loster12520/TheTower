import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import {
  Card,
  List,
  Button,
  Space,
  Tag,
  Popconfirm,
  Modal,
  Form,
  Input,
  Typography,
  Empty,
  Spin,
  message,
  Dropdown
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  MoreOutlined,
  FileTextOutlined,
  ImportOutlined,
  ExportOutlined
} from '@ant-design/icons';
import { history } from 'umi';
import { templateStore } from '@/stores/templateStore';
import type { TemplateListItem } from '@/stores/templateStore';
import './index.scss';

const { Title, Text, Paragraph } = Typography;

const HomePage: React.FC = observer(() => {
  // 表单实例
  const [createForm] = Form.useForm();
  const [renameForm] = Form.useForm();

  // 组件挂载时加载数据
  useEffect(() => {
    templateStore.fetchTemplates();
  }, []);

  // 处理新建模板
  const handleCreate = async (values: { name: string; description?: string }) => {
    const id = await templateStore.createTemplate(values.name, values.description);
    if (id) {
      message.success('模板创建成功');
      templateStore.setCreateModalVisible(false);
      createForm.resetFields();
      // 跳转到编辑器
      history.push(`/editor?id=${id}`);
    }
  };

  // 处理重命名
  const handleRename = async (values: { name: string; description?: string }) => {
    if (!templateStore.currentTemplate) return;
    
    const success = await templateStore.renameTemplate(
      templateStore.currentTemplate.id,
      values.name,
      values.description
    );
    
    if (success) {
      message.success('模板更新成功');
      templateStore.setRenameModalVisible(false);
      renameForm.resetFields();
    }
  };

  // 处理删除
  const handleDelete = async (template: TemplateListItem) => {
    const success = await templateStore.deleteTemplate(template.id);
    if (success) {
      message.success('模板已删除');
    }
  };

  // 处理编辑
  const handleEdit = (template: TemplateListItem) => {
    history.push(`/editor?id=${template.id}`);
  };

  // 处理运行
  const handleRun = (template: TemplateListItem) => {
    history.push(`/editor?id=${template.id}&run=true`);
  };

  // 处理导入
  const handleImport = () => {
    // TODO: 实现导入功能
    message.info('导入功能开发中...');
  };

  // 处理导出
  const handleExport = (template: TemplateListItem) => {
    // TODO: 实现导出功能
    message.info('导出功能开发中...');
  };

  // 打开重命名对话框
  const openRenameModal = (template: TemplateListItem) => {
    templateStore.setCurrentTemplate(template);
    renameForm.setFieldsValue({
      name: template.name,
      description: template.description || ''
    });
    templateStore.setRenameModalVisible(true);
  };

  // 渲染模板卡片
  const renderTemplateCard = (template: TemplateListItem) => (
    <Card
      hoverable
      className="template-card"
      actions={[
        <Button
          key="edit"
          type="link"
          icon={<EditOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            handleEdit(template);
          }}
        >
          编辑
        </Button>,
        <Button
          key="run"
          type="link"
          icon={<PlayCircleOutlined />}
          disabled={template.stats.stepCount === 0}
          onClick={(e) => {
            e.stopPropagation();
            handleRun(template);
          }}
        >
          运行
        </Button>,
        <Dropdown
          key="more"
          menu={{
            items: [
              {
                key: 'rename',
                icon: <EditOutlined />,
                label: '重命名',
                onClick: () => openRenameModal(template)
              },
              {
                key: 'export',
                icon: <ExportOutlined />,
                label: '导出',
                onClick: () => handleExport(template)
              },
              { type: 'divider' },
              {
                key: 'delete',
                icon: <DeleteOutlined />,
                label: (
                  <Popconfirm
                    title="确定要删除这个模板吗？"
                    description="删除后无法恢复，请谨慎操作。"
                    onConfirm={() => handleDelete(template)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <span className="home-page__danger-text">删除</span>
                  </Popconfirm>
                )
              }
            ]
          }}
          placement="bottomRight"
        >
          <Button type="link" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      ]}
      onClick={() => handleEdit(template)}
    >
      <Card.Meta
        title={
          <Space>
            <FileTextOutlined />
            <Text strong className="home-page__card-title">{template.name}</Text>
          </Space>
        }
        description={
          <Space direction="vertical" size="small" className="home-page__card-desc">
            <Paragraph
              type="secondary"
              ellipsis={{ rows: 2 }}
              className="home-page__card-paragraph"
            >
              {template.description || '暂无描述'}
            </Paragraph>
            
            <Space wrap>
              <Tag color="blue">{template.stats.stepCount} 个节点</Tag>
              {template.lastRun && (
                <Tag color={templateStore.getStatusColor(template.lastRun.status)}>
                  上次运行: {templateStore.getStatusText(template.lastRun.status)}
                </Tag>
              )}
            </Space>
            
            <Text type="secondary" className="home-page__card-time">
              更新于: {new Date(template.updatedAt).toLocaleString()}
            </Text>
          </Space>
        }
      />
    </Card>
  );

  return (
    <div className="home-page">
      {/* 页面标题 */}
      <div className="home-page__header">
        <Title level={2}>工作流模板</Title>
        <Text type="secondary">管理和运行您的浏览器自动化工作流</Text>
      </div>

      {/* 操作栏 */}
      <Space className="home-page__actions">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={() => templateStore.setCreateModalVisible(true)}
        >
          新建模板
        </Button>
        <Button
          icon={<ImportOutlined />}
          size="large"
          onClick={handleImport}
        >
          导入模板
        </Button>
      </Space>

      {/* 错误提示 */}
      {templateStore.error && (
        <div className="home-page__error-box">
          <Text type="danger">{templateStore.error}</Text>
          <Button type="link" onClick={() => templateStore.fetchTemplates()}>重试</Button>
        </div>
      )}

      {/* 模板列表 */}
      <Spin spinning={templateStore.loading}>
        {templateStore.templates.length > 0 ? (
          <List
            grid={{
              gutter: 16,
              xs: 1,
              sm: 2,
              md: 3,
              lg: 3,
              xl: 3,
              xxl: 4
            }}
            dataSource={templateStore.templates}
            renderItem={(item) => (
              <List.Item>
                {renderTemplateCard(item)}
              </List.Item>
            )}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无模板"
          >
            <Button type="primary" onClick={() => templateStore.setCreateModalVisible(true)}>
              创建第一个模板
            </Button>
          </Empty>
        )}
      </Spin>

      {/* 新建模板对话框 */}
      <Modal
        title="新建模板"
        open={templateStore.createModalVisible}
        onCancel={() => {
          templateStore.setCreateModalVisible(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        okText="创建"
        cancelText="取消"
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreate}
          autoComplete="off"
        >
          <Form.Item
            label="模板名称"
            name="name"
            rules={[
              { required: true, message: '请输入模板名称' },
              { max: 50, message: '名称不能超过 50 个字符' }
            ]}
          >
            <Input placeholder="例如：抓取网页标题" />
          </Form.Item>

          <Form.Item
            label="描述（可选）"
            name="description"
          >
            <Input.TextArea
              rows={3}
              placeholder="简要描述这个工作流的功能..."
              maxLength={200}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 重命名对话框 */}
      <Modal
        title="编辑模板信息"
        open={templateStore.renameModalVisible}
        onCancel={() => {
          templateStore.setRenameModalVisible(false);
          renameForm.resetFields();
        }}
        onOk={() => renameForm.submit()}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={renameForm}
          layout="vertical"
          onFinish={handleRename}
          autoComplete="off"
        >
          <Form.Item
            label="模板名称"
            name="name"
            rules={[
              { required: true, message: '请输入模板名称' },
              { max: 50, message: '名称不能超过 50 个字符' }
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="描述"
            name="description"
          >
            <Input.TextArea
              rows={3}
              placeholder="简要描述这个工作流的功能..."
              maxLength={200}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
});

export default HomePage;
