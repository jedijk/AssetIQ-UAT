/**
 * NotificationSettings - Component to manage push notification preferences
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, BellRing, Check, AlertTriangle, Smartphone, Clock, FileText, Eye, Search, Calendar, Share, Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import {
  isNotificationSupported,
  getPermissionStatus,
  requestPermission,
  getNotificationSettings,
  saveNotificationSettings,
  notify,
  unsubscribeFromPush,
  isIOS,
  isStandalone,
  getNotificationSupportInfo,
} from '../services/notificationService';

export function NotificationSettings({ compact = false }) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [settings, setSettings] = useState(getNotificationSettings());
  const [loading, setLoading] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [supportInfo, setSupportInfo] = useState({});

  useEffect(() => {
    setSupported(isNotificationSupported());
    setPermission(getPermissionStatus());
    setSettings(getNotificationSettings());
    setSupportInfo(getNotificationSupportInfo());
  }, []);

  const handleEnableNotifications = async () => {
    setLoading(true);
    try {
      const result = await requestPermission();
      setPermission(getPermissionStatus());
      if (result.success) {
        setSettings(getNotificationSettings());
      }
    } catch (e) {
      console.error('Failed to enable notifications:', e);
    }
    setLoading(false);
  };

  const handleDisableNotifications = async () => {
    setLoading(true);
    try {
      await unsubscribeFromPush();
      setSettings(getNotificationSettings());
    } catch (e) {
      console.error('Failed to disable notifications:', e);
    }
    setLoading(false);
  };

  const updateSetting = useCallback((key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveNotificationSettings(newSettings);
  }, [settings]);

  const sendTestNotification = async () => {
    setTestSent(false);
    await notify.system(
      '🔔 Test Notification',
      'Push notifications are working! You will receive alerts even when the app is in the background.',
      '/dashboard'
    );
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  if (!supported) {
    // iOS requires PWA installation
    if (supportInfo.requiresInstall) {
      return (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Install the app for notifications</p>
                  <p className="text-sm text-slate-600 mt-1">
                    On iPhone/iPad, push notifications require installing the app to your home screen.
                  </p>
                </div>
              </div>
              
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-slate-700">How to install:</p>
                <ol className="text-sm text-slate-600 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</span>
                    <span>Tap the <Share className="w-4 h-4 inline text-blue-600" /> Share button in Safari</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 text-xs font-bold">2</span>
                    <span>Scroll down and tap <strong>"Add to Home Screen"</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 text-xs font-bold">3</span>
                    <span>Tap <strong>"Add"</strong> in the top right corner</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 text-xs font-bold">4</span>
                    <span>Open the app from your home screen and enable notifications</span>
                  </li>
                </ol>
              </div>
              
              <p className="text-xs text-slate-500">
                Requires iOS 16.4 or later. After installing, you'll be able to receive notifications even when the app is closed.
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <p className="text-sm">
              Push notifications are not supported in this browser. Try using Chrome, Firefox, or Safari on a supported device.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-xl">
        <div className="flex items-center gap-3">
          {settings.enabled ? (
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <BellRing className="w-5 h-5 text-emerald-600" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <BellOff className="w-5 h-5 text-slate-400" />
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-slate-900">Push Notifications</p>
            <p className="text-xs text-slate-500">
              {settings.enabled ? 'Enabled - Get alerts outside the app' : 'Disabled - Enable to stay updated'}
            </p>
          </div>
        </div>
        {permission === 'denied' ? (
          <Badge variant="secondary" className="text-amber-600 bg-amber-50">Blocked</Badge>
        ) : settings.enabled ? (
          <Button variant="outline" size="sm" onClick={handleDisableNotifications} disabled={loading}>
            Disable
          </Button>
        ) : (
          <Button size="sm" onClick={handleEnableNotifications} disabled={loading}>
            {loading ? 'Enabling...' : 'Enable'}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              settings.enabled ? 'bg-emerald-100' : 'bg-slate-100'
            }`}>
              {settings.enabled ? (
                <BellRing className="w-5 h-5 text-emerald-600" />
              ) : (
                <Bell className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div>
              <CardTitle className="text-base">Push Notifications</CardTitle>
              <CardDescription>Get alerts even when the app is closed</CardDescription>
            </div>
          </div>
          {permission === 'denied' ? (
            <Badge variant="secondary" className="text-amber-600 bg-amber-50">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Blocked in browser
            </Badge>
          ) : (
            <Badge variant={settings.enabled ? 'default' : 'secondary'}>
              {settings.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Permission status */}
        {permission === 'denied' && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Notifications blocked</p>
              <p className="text-sm text-amber-700 mt-1">
                You've blocked notifications for this site. To enable them, click the lock icon in your browser's address bar and allow notifications.
              </p>
            </div>
          </div>
        )}

        {/* Enable/Disable */}
        {permission !== 'denied' && (
          <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-slate-600" />
              <div>
                <p className="text-sm font-medium text-slate-900">Enable push notifications</p>
                <p className="text-xs text-slate-500">Receive alerts on your device even when the app is closed</p>
              </div>
            </div>
            {settings.enabled ? (
              <Button variant="outline" onClick={handleDisableNotifications} disabled={loading}>
                {loading ? 'Disabling...' : 'Disable'}
              </Button>
            ) : (
              <Button onClick={handleEnableNotifications} disabled={loading}>
                {loading ? 'Enabling...' : 'Enable'}
              </Button>
            )}
          </div>
        )}

        {/* Notification types */}
        {settings.enabled && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-900">Notification types</p>
            
            <div className="space-y-3">
              <NotificationToggle
                icon={AlertTriangle}
                iconColor="text-red-500"
                label="Overdue actions"
                description="Alert when actions pass their due date"
                checked={settings.overdueActions}
                onChange={(v) => updateSetting('overdueActions', v)}
              />
              
              <NotificationToggle
                icon={FileText}
                iconColor="text-blue-500"
                label="New tasks"
                description="When a new task is assigned to you"
                checked={settings.newTasks}
                onChange={(v) => updateSetting('newTasks', v)}
              />
              
              <NotificationToggle
                icon={Clock}
                iconColor="text-purple-500"
                label="Form reminders"
                description="Reminders for scheduled forms"
                checked={settings.formReminders}
                onChange={(v) => updateSetting('formReminders', v)}
              />
              
              <NotificationToggle
                icon={Eye}
                iconColor="text-amber-500"
                label="Observation alerts"
                description="When new observations are reported"
                checked={settings.observationAlerts}
                onChange={(v) => updateSetting('observationAlerts', v)}
              />
              
              <NotificationToggle
                icon={Search}
                iconColor="text-indigo-500"
                label="Investigation updates"
                description="Updates on investigations you're involved in"
                checked={settings.investigationUpdates}
                onChange={(v) => updateSetting('investigationUpdates', v)}
              />
              
              <NotificationToggle
                icon={Calendar}
                iconColor="text-emerald-500"
                label="Daily summary"
                description="A daily overview of pending items"
                checked={settings.dailySummary}
                onChange={(v) => updateSetting('dailySummary', v)}
              />
            </div>

            {/* Sound toggle */}
            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Notification sound</p>
                  <p className="text-xs text-slate-500">Play a sound when notifications arrive</p>
                </div>
                <Switch
                  checked={settings.sound}
                  onCheckedChange={(v) => updateSetting('sound', v)}
                />
              </div>
            </div>

            {/* Test notification */}
            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Test notifications</p>
                  <p className="text-xs text-slate-500">Send a test notification to verify setup</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={sendTestNotification}
                  className="gap-2"
                >
                  {testSent ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" />
                      Sent!
                    </>
                  ) : (
                    <>
                      <Bell className="w-4 h-4" />
                      Send test
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NotificationToggle({ icon: Icon, iconColor, label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 bg-white border border-slate-200 rounded-xl">
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        <div>
          <p className="text-sm font-medium text-slate-700">{label}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default NotificationSettings;
