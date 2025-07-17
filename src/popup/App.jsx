import React, { useState, useEffect } from 'react';
import { 
  Layout, 
  Button, 
  Input, 
  Switch, 
  message,
  Typography, 
  Space,
  Card,
  List,
  Popconfirm,
  Modal,
  Form
} from 'antd';
import {
  SaveOutlined,
  ImportOutlined,
  ExportOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined
} from '@ant-design/icons';

const { Header, Content } = Layout;
const { TextArea } = Input;
const { Title, Text } = Typography;

const App = () => {
  const [proxyConfigs, setProxyConfigs] = useState([]);
  const [editingConfig, setEditingConfig] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState(true); // 添加全局开关状态
  const [form] = Form.useForm();

  // 默认配置示例
  const getDefaultConfig = (name) => ({
    id: Date.now().toString(),
    name: name || '新代理配置',
    enabled: false,
    config: {
      "proxy": [
        [
          "https://www.myproject.com/umi.2c8a01df.js",
          "http://127.0.0.1:8000/umi.js"
        ],
        [
          "https://www.myproject.com/(.*\\.js)",
          "http://127.0.0.1:8000/$1"
        ]
      ]
    }
  });

  // 初始化：从存储中加载配置和全局开关状态
  useEffect(() => {
    chrome.storage.local.get(['proxyConfigs', 'globalEnabled'], (result) => {
      if (result.proxyConfigs && Array.isArray(result.proxyConfigs) && result.proxyConfigs.length > 0) {
        setProxyConfigs(result.proxyConfigs);
      } else {
        // 如果没有配置，创建一个默认配置
        const defaultConfigs = [getDefaultConfig('默认配置')];
        setProxyConfigs(defaultConfigs);
        saveConfigs(defaultConfigs);
      }
      
      // 加载全局开关状态，默认为启用
      if (result.globalEnabled !== undefined) {
        setGlobalEnabled(result.globalEnabled);
      }
    });
  }, []);

  // 保存配置到存储
  const saveConfigs = (configs) => {
    chrome.storage.local.set({ proxyConfigs: configs }, () => {
      // 通知后台脚本重新加载配置
      chrome.runtime.sendMessage({ action: 'reloadConfigs' });
    });
  };

  // 切换全局开关状态
  const toggleGlobal = (enabled) => {
    setGlobalEnabled(enabled);
    chrome.runtime.sendMessage({ 
      action: 'toggleGlobal', 
      enabled 
    }, (response) => {
      if (response && response.success) {
        message.success(`xSwitch已${enabled ? '启用' : '禁用'}`);
      } else {
        message.error('切换失败，请重试');
        setGlobalEnabled(!enabled); // 回滚状态
      }
    });
  };

  // 验证JSON格式
  const validateJson = (text) => {
    try {
      const parsed = JSON.parse(text);
      return parsed.proxy && Array.isArray(parsed.proxy);
    } catch (e) {
      return false;
    }
  };

  // 添加新的代理配置
  const addConfig = () => {
    setEditingConfig(getDefaultConfig());
    form.setFieldsValue({
      name: '新代理配置',
      configText: JSON.stringify(getDefaultConfig().config, null, 2)
    });
    setIsModalVisible(true);
  };

  // 编辑代理配置
  const editConfig = (config) => {
    setEditingConfig(config);
    form.setFieldsValue({
      name: config.name,
      configText: JSON.stringify(config.config, null, 2)
    });
    setIsModalVisible(true);
  };

  // 复制代理配置
  const copyConfig = (config) => {
    const newConfig = {
      ...config,
      id: Date.now().toString(),
      name: config.name + ' (副本)',
      enabled: false
    };
    const newConfigs = [...proxyConfigs, newConfig];
    setProxyConfigs(newConfigs);
    saveConfigs(newConfigs);
    message.success('配置复制成功');
  };

  // 删除代理配置
  const deleteConfig = (configId) => {
    const newConfigs = proxyConfigs.filter(config => config.id !== configId);
    setProxyConfigs(newConfigs);
    saveConfigs(newConfigs);
    message.success('配置删除成功');
  };

  // 切换配置启用状态
  const toggleConfig = (configId, enabled) => {
    const newConfigs = proxyConfigs.map(config => 
      config.id === configId ? { ...config, enabled } : config
    );
    setProxyConfigs(newConfigs);
    saveConfigs(newConfigs);
    message.info(`代理配置已${enabled ? '启用' : '禁用'}`);
  };

  // 保存配置编辑
  const saveConfigEdit = () => {
    form.validateFields()
      .then(values => {
        const { name, configText } = values;
        
        if (!validateJson(configText)) {
          message.error('JSON格式不正确或缺少proxy字段');
          return;
        }

        try {
          const config = JSON.parse(configText);
          const updatedConfig = {
            ...editingConfig,
            name,
            config
          };

          let newConfigs;
          if (proxyConfigs.find(c => c.id === editingConfig.id)) {
            // 更新现有配置
            newConfigs = proxyConfigs.map(c => 
              c.id === editingConfig.id ? updatedConfig : c
            );
          } else {
            // 添加新配置
            newConfigs = [...proxyConfigs, updatedConfig];
          }

          setProxyConfigs(newConfigs);
          saveConfigs(newConfigs);
          setIsModalVisible(false);
          setEditingConfig(null);
          form.resetFields();
          message.success('配置保存成功');
        } catch (error) {
          message.error('保存失败：' + error.message);
        }
      });
  };

  // 导出所有配置
  const exportAllConfigs = () => {
    const exportData = {
      version: '1.0',
      configs: proxyConfigs
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xswitch_all_configs.json';
    a.click();
    
    URL.revokeObjectURL(url);
    message.success('所有配置导出成功');
  };

  // 导入配置
  const importConfigs = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        
        if (importedData.configs && Array.isArray(importedData.configs)) {
          // 导入多个配置
          const newConfigs = importedData.configs.map(config => ({
            ...config,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            enabled: false // 导入的配置默认禁用
          }));
          
          const allConfigs = [...proxyConfigs, ...newConfigs];
          setProxyConfigs(allConfigs);
          saveConfigs(allConfigs);
          message.success(`成功导入 ${newConfigs.length} 个配置`);
        } else if (importedData.proxy && Array.isArray(importedData.proxy)) {
          // 导入单个配置
          const newConfig = {
            id: Date.now().toString(),
            name: '导入的配置',
            enabled: false,
            config: importedData
          };
          
          const newConfigs = [...proxyConfigs, newConfig];
          setProxyConfigs(newConfigs);
          saveConfigs(newConfigs);
          message.success('配置导入成功');
        } else {
          message.error('导入失败：配置格式不正确');
        }
      } catch (error) {
        message.error('导入失败：无效的JSON文件');
      }
    };
    reader.readAsText(file);
    
    // 清空input值，以便可以重复导入同一文件
    event.target.value = '';
  };

  // 获取启用的配置数量
  const enabledCount = proxyConfigs.filter(config => config.enabled).length;

  return (
    <Layout style={{ minHeight: '500px' }}>
      <Header style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '0 16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Title level={4} style={{ color: '#fff', margin: 0 }}>
            xSwitch ({enabledCount}/{proxyConfigs.length} 启用)
          </Title>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Text style={{ color: '#fff', fontSize: '12px' }}>
              {globalEnabled ? '总开关：启用' : '总开关：禁用'}
            </Text>
            <Switch 
              checked={globalEnabled}
              onChange={toggleGlobal}
              size="small"
              style={{ 
                backgroundColor: globalEnabled ? '#52c41a' : '#ff4d4f'
              }}
            />
          </div>
        </div>
        <Space>
          <Button 
            icon={<ImportOutlined />}
            onClick={() => document.getElementById('import-input').click()}
            size="small"
          >
            导入
            <input
              id="import-input"
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={importConfigs}
            />
          </Button>
          <Button 
            icon={<ExportOutlined />}
            onClick={exportAllConfigs}
            size="small"
          >
            导出全部
          </Button>
          <Button 
            type="primary"
            icon={<PlusOutlined />}
            onClick={addConfig}
            size="small"
          >
            新建配置
          </Button>
        </Space>
      </Header>
      
      <Content style={{ padding: '16px' }}>
        {!globalEnabled && (
          <Card 
            style={{ 
              marginBottom: '16px', 
              borderColor: '#ff4d4f',
              backgroundColor: '#fff2f0'
            }}
            size="small"
          >
            <Text style={{ color: '#ff4d4f', fontSize: '14px' }}>
              ⚠️ xSwitch 总开关已禁用，所有代理规则暂停生效
            </Text>
          </Card>
        )}
        
        <List
          dataSource={proxyConfigs}
          renderItem={(config) => (
            <List.Item key={config.id}>
              <Card 
                style={{ 
                  width: '100%',
                  opacity: globalEnabled ? 1 : 0.6
                }}
                size="small"
                title={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{config.name}</span>
                    <Switch 
                      checked={config.enabled}
                      onChange={(checked) => toggleConfig(config.id, checked)}
                      size="small"
                      disabled={!globalEnabled}
                    />
                  </div>
                }
                extra={
                  <Space>
                    <Button 
                      icon={<EditOutlined />}
                      onClick={() => editConfig(config)}
                      size="small"
                    />
                    <Button 
                      icon={<CopyOutlined />}
                      onClick={() => copyConfig(config)}
                      size="small"
                    />
                    <Popconfirm
                      title="确定删除此配置?"
                      onConfirm={() => deleteConfig(config.id)}
                      okText="是"
                      cancelText="否"
                    >
                      <Button 
                        icon={<DeleteOutlined />}
                        size="small" 
                        danger
                      />
                    </Popconfirm>
                  </Space>
                }
              >
                <div style={{ fontSize: '12px', color: '#666' }}>
                  {config.config.proxy.length} 条代理规则
                  {config.enabled && globalEnabled && <span style={{ color: '#52c41a', marginLeft: 8 }}>● 已启用</span>}
                  {config.enabled && !globalEnabled && <span style={{ color: '#ff4d4f', marginLeft: 8 }}>● 总开关禁用</span>}
                </div>
              </Card>
            </List.Item>
          )}
          locale={{ emptyText: '暂无代理配置' }}
        />

        <Modal
          title={editingConfig && proxyConfigs.find(c => c.id === editingConfig.id) ? "编辑代理配置" : "新建代理配置"}
          open={isModalVisible}
          onOk={saveConfigEdit}
          onCancel={() => {
            setIsModalVisible(false);
            setEditingConfig(null);
            form.resetFields();
          }}
          width={700}
          okText="保存"
          cancelText="取消"
        >
          <Form form={form} layout="vertical">
            <Form.Item
              name="name"
              label="配置名称"
              rules={[{ required: true, message: '请输入配置名称' }]}
            >
              <Input placeholder="请输入配置名称，如：项目1" />
            </Form.Item>
            
            <Form.Item
              name="configText"
              label="代理规则"
              rules={[
                { required: true, message: '请输入代理规则' },
                {
                  validator: (_, value) => {
                    if (validateJson(value)) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('JSON格式不正确或缺少proxy字段'));
                  }
                }
              ]}
            >
              <TextArea
                rows={10}
                placeholder="请输入JSON格式的代理配置..."
                style={{ 
                  fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                  fontSize: '12px'
                }}
              />
            </Form.Item>
          </Form>
        </Modal>

        <Card title="使用说明" style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
            <p><strong>配置格式：</strong></p>
            <pre style={{ background: '#f5f5f5', padding: '8px', borderRadius: '4px' }}>
{`{
  "proxy": [
    ["匹配的URL", "替换的URL"],
    ["支持正则表达式", "支持$1占位符"]
  ]
}`}
            </pre>
            <p><strong>示例：</strong></p>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              <li>精确匹配：<code>["https://example.com/app.js", "http://localhost:3000/app.js"]</code></li>
              <li>正则匹配：<code>["https://example.com/(.*\\.js)", "http://localhost:3000/$1"]</code></li>
            </ul>
          </div>
        </Card>
      </Content>
    </Layout>
  );
};

export default App;