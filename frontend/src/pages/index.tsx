import React, { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import {
  Card,
  List,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Checkbox,
  Select,
  InputNumber,
  Typography,
  Empty,
  Spin,
  message,
  Dropdown,
  Tooltip,
  Drawer,
  Segmented,
  Descriptions
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  MoreOutlined,
  FileTextOutlined,
  ImportOutlined,
  ExportOutlined,
  CopyOutlined,
  SearchOutlined,
  ShopOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  TeamOutlined
} from '@ant-design/icons';
import { history } from 'umi';
import {
  DEFAULT_TEMPLATE_SCHEMA_VERSION,
  SUPPORTED_TEMPLATE_SCHEMA_VERSIONS,
  templateStore,
} from '@/stores/templateStore';
import { scheduleStore } from '@/stores/scheduleStore';
import { authStore } from '@/stores/authStore';
import type { TemplateListItem } from '@/stores/templateStore';
import './index.scss';

const { Title, Text, Paragraph } = Typography;

const HomePage: React.FC = observer(() => {
  // 表单实例
  const [createForm] = Form.useForm();
  const [renameForm] = Form.useForm();
  const [scheduleForm] = Form.useForm();
  const [loginForm] = Form.useForm();
  const [shareForm] = Form.useForm();
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const downloadJson = (fileName: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const safeFileName = (name: string) =>
    name
      .replace(/[\\/:*?"<>|\u0000-\u001F]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);

  // 组件挂载时加载数据
  useEffect(() => {
    templateStore.fetchTemplates();
    authStore.hydrate();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      templateStore.fetchTemplates(templateStore.searchKeyword);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [templateStore.searchKeyword]);

  useEffect(() => {
    if (!scheduleStore.drawerVisible) {
      return;
    }

    scheduleStore.fetchSchedules();
    const timer = window.setInterval(() => {
      scheduleStore.fetchSchedules();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [scheduleStore.drawerVisible]);

  // 处理新建模板
  const handleCreate = async (values: { name: string; description?: string; groupName?: string; tags?: string[] }) => {
    const id = await templateStore.createTemplate(values.name, values.description, values.groupName, values.tags || []);
    if (id) {
      message.success('模板创建成功');
      templateStore.setCreateModalVisible(false);
      createForm.resetFields();
      // 跳转到编辑器
      history.push(`/editor?id=${id}`);
    }
  };

  // 处理重命名
  const handleRename = async (values: { name: string; description?: string; groupName?: string; tags?: string[] }) => {
    if (!templateStore.currentTemplate) return;
    
    const success = await templateStore.renameTemplate(
      templateStore.currentTemplate.id,
      values.name,
      values.description,
      values.groupName,
      values.tags || []
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

  const handleClone = async (template: TemplateListItem) => {
    const id = await templateStore.cloneTemplate(template.id);
    if (id) {
      message.success('模板已克隆');
    }
  };

  const handleBatchDelete = async () => {
    if (!templateStore.hasSelection) {
      message.warning('请先选择要删除的模板');
      return;
    }

    const result = await templateStore.batchDeleteTemplates(templateStore.selectedTemplateIds);
    if (!result) {
      message.error(templateStore.error || '批量删除失败');
      return;
    }

    if (result.failedIds.length > 0) {
      message.warning(`已删除 ${result.deletedCount} 个模板，${result.failedIds.length} 个删除失败`);
    } else {
      message.success(`已删除 ${result.deletedCount} 个模板`);
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
    importFileInputRef.current?.click();
  };

  // 处理导出
  const handleExport = async (template: TemplateListItem) => {
    const full = await templateStore.getTemplateById(template.id);
    if (!full) {
      message.error(templateStore.error || '导出失败');
      return;
    }

    const fileName = `${safeFileName(full.name)}-${full.id.slice(-8)}.json`;
    downloadJson(fileName, full);
    message.success('导出成功');
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选择同一个文件

    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;

      const id = await templateStore.importTemplateFromJson(json);
      if (id) {
        message.success('导入成功');
      } else {
        message.error(templateStore.error || '导入失败');
      }
    } catch (err) {
      message.error('导入失败：文件解析失败，请确认是合法 JSON');
    }
  };

  const openScheduleDrawer = async (template?: TemplateListItem) => {
    scheduleStore.setDrawerVisible(true);
    scheduleForm.setFieldsValue({
      templateId: template?.id,
      triggerType: 'ONE_TIME',
      delaySeconds: 3,
      intervalSeconds: 5,
    });
    await scheduleStore.fetchSchedules();
  };

  const handleCreateSchedule = async (values: { templateId: string; triggerType: 'ONE_TIME' | 'INTERVAL'; delaySeconds?: number; intervalSeconds?: number }) => {
    const success = await scheduleStore.createSchedule(values);
    if (success) {
      message.success('调度任务已创建');
      scheduleForm.setFieldsValue({
        templateId: values.templateId,
        triggerType: values.triggerType,
        delaySeconds: values.delaySeconds ?? 3,
        intervalSeconds: values.intervalSeconds ?? 5,
      });
    } else {
      message.error(scheduleStore.error || '创建调度失败');
    }
  };

  const handleToggleSchedule = async (id: string, enabled: boolean) => {
    const success = await scheduleStore.toggleSchedule(id, enabled);
    if (!success) {
      message.error(scheduleStore.error || '更新调度失败');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    const success = await scheduleStore.deleteSchedule(id);
    if (!success) {
      message.error(scheduleStore.error || '删除调度失败');
    }
  };

  const handleLogin = async (values: { email: string; password: string }) => {
    const success = await authStore.login(values.email, values.password);
    if (success) {
      message.success('登录成功');
      loginForm.resetFields();
      await templateStore.fetchTemplates();
    } else {
      message.error(authStore.error || '登录失败');
    }
  };

  const handleLogout = async () => {
    await authStore.logout();
    await templateStore.fetchTemplates();
    message.success('已退出登录');
  };

  const handleWorkspaceChange = async (workspaceId: string) => {
    await authStore.switchWorkspace(workspaceId);
    await templateStore.fetchTemplates();
    if (scheduleStore.drawerVisible) {
      await scheduleStore.fetchSchedules();
    }
    message.success('已切换工作空间');
  };

  const handleOpenCollaborationDrawer = async (template: TemplateListItem) => {
    shareForm.resetFields();
    await authStore.openCollaborationDrawer(template);
  };

  const handleShareTemplate = async (values: { email: string; permission: 'OWNER' | 'EDITOR' | 'VIEWER' }) => {
    const success = await authStore.shareTemplate(values.email, values.permission);
    if (success) {
      message.success('协作成员已更新');
      shareForm.resetFields();
    } else {
      message.error(authStore.error || '分享模板失败');
    }
  };

  const openMarketDrawer = async () => {
    templateStore.setMarketDrawerVisible(true);
    await templateStore.fetchMarketTemplates();
  };

  const handlePublishToMarket = async (template: TemplateListItem) => {
    const published = await templateStore.publishTemplateToMarket(template.id);
    if (published) {
      message.success('已发布到模板市场');
    } else {
      message.error(templateStore.error || '发布失败');
    }
  };

  const handleImportFromMarket = async (templateId: string) => {
    const importedId = await templateStore.importMarketTemplate(templateId);
    if (importedId) {
      message.success('市场模板已导入');
    } else {
      message.error(templateStore.error || '导入失败');
    }
  };

  // 打开重命名对话框
  const openRenameModal = (template: TemplateListItem) => {
    templateStore.setCurrentTemplate(template);
    renameForm.setFieldsValue({
      name: template.name,
      description: template.description || '',
      groupName: template.groupName || '',
      tags: template.tags,
    });
    templateStore.setRenameModalVisible(true);
  };

  // 渲染模板卡片
  const renderTemplateCard = (template: TemplateListItem) => (
    <Card
      hoverable
      className="template-card"
      extra={
        <Checkbox
          checked={templateStore.selectedTemplateIds.includes(template.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => templateStore.toggleTemplateSelection(template.id, e.target.checked)}
        >
          选择
        </Checkbox>
      }
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
                onClick: ({ domEvent }) => {
                  domEvent.stopPropagation();
                  openRenameModal(template);
                }
              },
              {
                key: 'clone',
                icon: <CopyOutlined />,
                label: '克隆',
                onClick: ({ domEvent }) => {
                  domEvent.stopPropagation();
                  handleClone(template);
                }
              },
              {
                key: 'export',
                icon: <ExportOutlined />,
                label: '导出',
                onClick: ({ domEvent }) => {
                  domEvent.stopPropagation();
                  handleExport(template);
                }
              },
              {
                key: 'publish-market',
                icon: <ShopOutlined />,
                label: '发布到市场',
                onClick: ({ domEvent }) => {
                  domEvent.stopPropagation();
                  handlePublishToMarket(template);
                }
              },
              {
                key: 'schedule',
                icon: <ClockCircleOutlined />,
                label: '创建调度',
                onClick: ({ domEvent }) => {
                  domEvent.stopPropagation();
                  openScheduleDrawer(template);
                }
              },
              {
                key: 'collaboration',
                icon: <TeamOutlined />,
                label: '协作设置',
                onClick: ({ domEvent }) => {
                  domEvent.stopPropagation();
                  handleOpenCollaborationDrawer(template);
                }
              },
              { type: 'divider' },
              {
                key: 'delete',
                icon: <DeleteOutlined />,
                label: <span className="home-page__danger-text">删除</span>,
                onClick: ({ domEvent }) => {
                  domEvent.stopPropagation();
                  Modal.confirm({
                    title: '确定要删除这个模板吗？',
                    content: '删除后无法恢复，请谨慎操作。',
                    okText: '删除',
                    cancelText: '取消',
                    okButtonProps: { danger: true },
                    onOk: () => handleDelete(template),
                  });
                }
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
              {template.groupName && <Tag color="purple">分组: {template.groupName}</Tag>}
              <Tag className="home-page__schema-tag">Schema {template.schemaVersion}</Tag>
              <Tag color="blue">{template.stats.stepCount} 个节点</Tag>
              {template.tags.map((tag) => (
                <Tag key={tag} color="geekblue">#{tag}</Tag>
              ))}
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
      <input
        ref={importFileInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={handleImportFileChange}
      />

      {/* 页面标题 */}
      <div className="home-page__header">
        <Space align="center" wrap>
          <Title level={2}>工作流模板</Title>
          <Tag color="gold" className="home-page__default-version-tag">
            默认版本 {DEFAULT_TEMPLATE_SCHEMA_VERSION}
          </Tag>
        </Space>
        <Text type="secondary">管理和运行您的浏览器自动化工作流，导入兼容 {SUPPORTED_TEMPLATE_SCHEMA_VERSIONS.join(' / ')}</Text>
      </div>

      {/* 操作栏 */}
      <div className="home-page__actions">
        <Space wrap className="home-page__actions-main">
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
          <Button
            icon={<ShopOutlined />}
            size="large"
            onClick={openMarketDrawer}
          >
            模板市场
          </Button>
          <Button
            icon={<ClockCircleOutlined />}
            size="large"
            onClick={() => openScheduleDrawer()}
          >
            调度任务
          </Button>
          <Button
            icon={<SafetyCertificateOutlined />}
            size="large"
            onClick={() => authStore.setDrawerVisible(true)}
          >
            账户权限
          </Button>
          <Input
            allowClear
            value={templateStore.searchKeyword}
            prefix={<SearchOutlined />}
            placeholder="按模板名称或描述搜索"
            className="home-page__search"
            onChange={(e) => templateStore.setSearchKeyword(e.target.value)}
          />
          <Select
            allowClear
            value={templateStore.selectedGroupName || undefined}
            placeholder="按分组筛选"
            className="home-page__filter"
            options={templateStore.groupOptions.map((group) => ({ label: group, value: group }))}
            onChange={(value) => templateStore.setSelectedGroupName(value || '')}
          />
          <Select
            allowClear
            value={templateStore.selectedTag || undefined}
            placeholder="按标签筛选"
            className="home-page__filter"
            options={templateStore.tagOptions.map((tag) => ({ label: `#${tag}`, value: tag }))}
            onChange={(value) => templateStore.setSelectedTag(value || '')}
          />
          {templateStore.hasActiveFilters && (
            <Button onClick={() => templateStore.clearFilters()}>
              清空筛选
            </Button>
          )}
        </Space>
        <Space wrap>
          <Checkbox
            checked={templateStore.isAllCurrentSelected}
            disabled={templateStore.templates.length === 0}
            onChange={(e) => templateStore.toggleSelectAllCurrent(e.target.checked)}
          >
            全选当前结果
          </Checkbox>
          <Tooltip title={templateStore.hasSelection ? `已选 ${templateStore.selectedTemplateIds.length} 个模板` : '先选择模板再批量删除'}>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={!templateStore.hasSelection}
              onClick={() => {
                Modal.confirm({
                  title: `确定删除选中的 ${templateStore.selectedTemplateIds.length} 个模板吗？`,
                  content: '删除后无法恢复，请谨慎操作。',
                  okText: '批量删除',
                  cancelText: '取消',
                  okButtonProps: { danger: true },
                  onOk: handleBatchDelete,
                });
              }}
            >
              批量删除
            </Button>
          </Tooltip>
        </Space>
      </div>

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
            description={templateStore.hasActiveFilters ? '没有匹配当前搜索或筛选条件的模板' : '暂无模板'}
          >
            {templateStore.hasActiveFilters ? (
              <Button onClick={() => templateStore.clearFilters()}>清空筛选</Button>
            ) : (
              <Button type="primary" onClick={() => templateStore.setCreateModalVisible(true)}>
                创建第一个模板
              </Button>
            )}
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

          <Form.Item
            label="分组（可选）"
            name="groupName"
            rules={[{ max: 30, message: '分组名称不能超过 30 个字符' }]}
          >
            <Input placeholder="例如：采集、登录、测试" maxLength={30} />
          </Form.Item>

          <Form.Item
            label="标签（可选）"
            name="tags"
            rules={[{ validator: async (_, value) => (!value || value.length <= 10 ? Promise.resolve() : Promise.reject(new Error('最多添加 10 个标签'))) }]}
          >
            <Select mode="tags" tokenSeparators={[',']} placeholder="输入后回车，可用于快速筛选" />
          </Form.Item>

          <Text type="secondary" className="home-page__modal-hint">
            新模板将使用 schemaVersion {DEFAULT_TEMPLATE_SCHEMA_VERSION}。导入模板支持 {SUPPORTED_TEMPLATE_SCHEMA_VERSIONS.join(' / ')}。
          </Text>
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

          <Form.Item
            label="分组"
            name="groupName"
            rules={[{ max: 30, message: '分组名称不能超过 30 个字符' }]}
          >
            <Input maxLength={30} />
          </Form.Item>

          <Form.Item
            label="标签"
            name="tags"
            rules={[{ validator: async (_, value) => (!value || value.length <= 10 ? Promise.resolve() : Promise.reject(new Error('最多添加 10 个标签'))) }]}
          >
            <Select mode="tags" tokenSeparators={[',']} placeholder="输入后回车" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="模板市场"
        open={templateStore.marketDrawerVisible}
        width={520}
        onClose={() => templateStore.setMarketDrawerVisible(false)}
      >
        <Spin spinning={templateStore.marketLoading}>
          {templateStore.marketTemplates.length > 0 ? (
            <List
              dataSource={templateStore.marketTemplates}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button key="import" type="primary" onClick={() => handleImportFromMarket(item.id)}>
                      导入
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    title={<Space wrap><span>{item.name}</span><Tag>Schema {item.schemaVersion}</Tag></Space>}
                    description={
                      <Space direction="vertical" size="small">
                        <Text type="secondary">{item.description || '暂无描述'}</Text>
                        <Space wrap>
                          {item.groupName && <Tag color="purple">分组: {item.groupName}</Tag>}
                          <Tag color="blue">{item.stats.stepCount} 个节点</Tag>
                          {item.tags.map((tag) => (
                            <Tag key={tag} color="geekblue">#{tag}</Tag>
                          ))}
                        </Space>
                        <Text type="secondary">发布于: {new Date(item.publishedAt).toLocaleString()}</Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          ) : (
            <Empty description="模板市场暂无已发布模板" />
          )}
        </Spin>
      </Drawer>

      <Drawer
        title="调度任务"
        open={scheduleStore.drawerVisible}
        width={560}
        onClose={() => scheduleStore.setDrawerVisible(false)}
      >
        <Form form={scheduleForm} layout="vertical" onFinish={handleCreateSchedule} autoComplete="off">
          <Form.Item label="模板" name="templateId" rules={[{ required: true, message: '请选择模板' }]}>
            <Select
              placeholder="选择要调度的模板"
              options={templateStore.templates.map((item) => ({ label: item.name, value: item.id }))}
            />
          </Form.Item>

          <Form.Item label="触发类型" name="triggerType" initialValue="ONE_TIME">
            <Segmented
              options={[
                { label: '单次执行', value: 'ONE_TIME' },
                { label: '固定间隔', value: 'INTERVAL' },
              ]}
            />
          </Form.Item>

          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => getFieldValue('triggerType') === 'INTERVAL' ? (
              <Form.Item label="间隔秒数" name="intervalSeconds" rules={[{ required: true, message: '请输入间隔秒数' }]}>
                <InputNumber min={1} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            ) : (
              <Form.Item label="延迟秒数" name="delaySeconds" rules={[{ required: true, message: '请输入延迟秒数' }]}>
                <InputNumber min={1} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            )}
          </Form.Item>

          <Button type="primary" htmlType="submit" block>
            创建调度
          </Button>
        </Form>

        <div style={{ marginTop: 24 }}>
          <Spin spinning={scheduleStore.loading}>
            {scheduleStore.schedules.length > 0 ? (
              <List
                dataSource={scheduleStore.schedules}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button key="toggle" onClick={() => handleToggleSchedule(item.id, !item.enabled)}>
                        {item.enabled ? '暂停' : '启用'}
                      </Button>,
                      <Button key="delete" danger onClick={() => handleDeleteSchedule(item.id)}>
                        删除
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space wrap>
                          <span>{item.templateName}</span>
                          <Tag color={item.enabled ? 'success' : 'default'}>{item.enabled ? '已启用' : '已暂停'}</Tag>
                          <Tag>{item.triggerType === 'INTERVAL' ? '固定间隔' : '单次执行'}</Tag>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size="small">
                          <Text type="secondary">
                            {item.triggerType === 'INTERVAL'
                              ? `每 ${item.intervalSeconds ?? '-'} 秒执行一次`
                              : `延迟 ${item.delaySeconds ?? '-'} 秒执行`}
                          </Text>
                          <Text type="secondary">下次触发: {item.nextTriggerAt ? new Date(item.nextTriggerAt).toLocaleString() : '无'}</Text>
                          <Text type="secondary">最近一次触发: {item.lastTriggeredAt ? new Date(item.lastTriggeredAt).toLocaleString() : '暂无'}</Text>
                          <Text type="secondary">最近运行状态: {item.lastRunStatus || '暂无'}</Text>
                          {item.lastError && <Text type="danger">最近错误: {item.lastError.message}</Text>}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="暂无调度任务" />
            )}
          </Spin>
        </div>
      </Drawer>

      <Drawer
        title="账户权限"
        open={authStore.drawerVisible}
        width={420}
        onClose={() => authStore.setDrawerVisible(false)}
      >
        {authStore.isLoggedIn && authStore.currentUser ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="当前用户">{authStore.currentUser.name}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{authStore.currentUser.email}</Descriptions.Item>
              <Descriptions.Item label="当前角色">{authStore.currentUser.role}</Descriptions.Item>
            </Descriptions>

            <Form layout="vertical">
              <Form.Item label="当前工作空间">
                <Select
                  value={authStore.currentUser.workspaceId}
                  options={authStore.workspaces.map((item) => ({
                    label: `${item.workspaceName} (${item.role})`,
                    value: item.workspaceId,
                  }))}
                  onChange={handleWorkspaceChange}
                />
              </Form.Item>
            </Form>

            <Button danger onClick={handleLogout}>
              退出登录
            </Button>
          </Space>
        ) : (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Text type="secondary">演示账号：alice@thetower.local / alice123，协作账号：bob@thetower.local / bob123。</Text>
            <Form form={loginForm} layout="vertical" onFinish={handleLogin} autoComplete="off">
              <Form.Item label="邮箱" name="email" rules={[{ required: true, message: '请输入邮箱' }]}>
                <Input placeholder="alice@thetower.local" />
              </Form.Item>
              <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password placeholder="alice123" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={authStore.loading} block>
                登录
              </Button>
            </Form>
          </Space>
        )}
      </Drawer>

      <Drawer
        title="协作设置"
        open={authStore.collaborationDrawerVisible}
        width={520}
        onClose={() => authStore.setCollaborationDrawerVisible(false)}
      >
        <Spin spinning={authStore.collaborationLoading}>
          {authStore.collaboration ? (
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="模板">{authStore.collaborationTemplate?.name || authStore.collaboration.templateId}</Descriptions.Item>
                <Descriptions.Item label="拥有者">{authStore.collaboration.ownerUserName}</Descriptions.Item>
                <Descriptions.Item label="归属工作空间">{authStore.collaboration.ownerWorkspaceName}</Descriptions.Item>
                <Descriptions.Item label="当前权限">{authStore.collaboration.currentPermission}</Descriptions.Item>
              </Descriptions>

              {authStore.isLoggedIn && (
                <Form form={shareForm} layout="vertical" onFinish={handleShareTemplate} autoComplete="off">
                  <Form.Item label="分享给" name="email" rules={[{ required: true, message: '请输入协作用户邮箱' }]}>
                    <Input placeholder="bob@thetower.local" />
                  </Form.Item>
                  <Form.Item label="权限" name="permission" initialValue="EDITOR">
                    <Select
                      options={[
                        { label: '可编辑', value: 'EDITOR' },
                        { label: '只读', value: 'VIEWER' },
                      ]}
                    />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" icon={<TeamOutlined />}>
                    添加协作成员
                  </Button>
                </Form>
              )}

              {authStore.collaboration.collaborators.length > 0 ? (
                <List
                  dataSource={authStore.collaboration.collaborators}
                  renderItem={(item) => (
                    <List.Item>
                      <List.Item.Meta
                        title={<Space wrap><span>{item.userName}</span><Tag>{item.permission}</Tag></Space>}
                        description={
                          <Space direction="vertical" size="small">
                            <Text type="secondary">{item.email}</Text>
                            <Text type="secondary">工作空间: {item.workspaceName}</Text>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="当前模板还没有协作成员" />
              )}
            </Space>
          ) : (
            <Empty description="暂无协作信息" />
          )}
        </Spin>
      </Drawer>
    </div>
  );
});

export default HomePage;
