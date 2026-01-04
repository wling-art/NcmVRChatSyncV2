<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Settings } from "../../electron/services/config";
import { PlayStatus } from "../../electron/services/launch/monitor";
import { formatTime, generateProgressBar, getLyricPair } from "../../utils/format";

const status = ref("未连接");
const playstatus = ref<PlayStatus | null>(null);

const isLaunching = ref(false);
const isLaunched = ref(false);
const isStarting = ref(false);
const isSaving = ref(false);
const oscStatus = ref(false);
const oscOutput = ref("");

const formData = ref<Settings>({
  osc: {
    ip: "127.0.0.1",
    port: 9000
  },
  refresh: {
    interval: 2
  },
  bar: {
    width: 20,
    filled: "█",
    thumb: "●",
    empty: "░"
  },
  output: {
    template: "{song} - {artist}\n{bar}\n{time}\n{lyric1}\n    {lyric2}"
  },
  ncmPath: ""
});

const preview = computed(() => {
  if (!playstatus.value) {
    return "暂无播放信息";
  }
  const { current: lyrics1, next: lyrics2 } = getLyricPair(
    playstatus.value?.songInfo?.lyrics || [],
    playstatus.value?.current || 0
  );

  return formData.value.output.template
    .replace("{song}", playstatus.value?.songInfo?.title || "示例歌曲")
    .replace("{artist}", playstatus.value?.songInfo?.artist || "示例艺术家")
    .replace(
      "{bar}",
      generateProgressBar(playstatus.value?.current || 0, playstatus.value?.songInfo?.duration || 0, formData.value.bar)
    )
    .replace("{time}", `${formatTime(playstatus.value?.current)}/${formatTime(playstatus.value?.songInfo?.duration)}`)
    .replace("{lyric1}", lyrics1)
    .replace("{lyric2}", lyrics2);
});

const handleLaunch = async () => {
  isLaunching.value = true;
  if (isLaunched.value) {
    await window.api.stopNcm();
  } else {
    if (formData.value.ncmPath === "") {
      alert("请先选择网易云路径");
      isLaunching.value = false;
      return;
    }
    await window.api.launchNcm(formData.value.ncmPath);
  }
  isLaunching.value = false;
};

async function doBrowse() {
  const path = await window.api.selectDirectory();
  console.log("Selected path:", path);
  if (path) {
    formData.value.ncmPath = path;
  }
}

const doStart = async () => {
  isStarting.value = true;
  try {
    const result = await window.api.startOsc();
    if (result.success) {
      oscStatus.value = true;
      console.log("[Home] OSC started successfully");
      isStarting.value = false;
    } else {
      console.error("[Home] Failed to start OSC:", result.error);
      alert("启动 OSC 失败：" + (result.error || "未知错误"));
      isStarting.value = false;
    }
  } catch (error) {
    console.error("[Home] Error starting OSC:", error);
    alert("启动 OSC 出错");
    isStarting.value = false;
  }
};

const toggleOsc = async () => {
  if (oscStatus.value) {
    // 停止
    try {
      await window.api.stopOsc();
      oscStatus.value = false;
      isStarting.value = false;
      console.log("[Home] OSC stopped");
    } catch (error) {
      console.error("[Home] Error stopping OSC:", error);
    }
  } else {
    // 启动
    await doStart();
  }
};

const loadSettings = async () => {
  try {
    const settings = await window.api.getSettings();
    formData.value = settings;
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
};

const saveSettings = async () => {
  isSaving.value = true;
  try {
    const cleanData = JSON.parse(JSON.stringify(formData.value));
    await window.api.saveSettings(cleanData);
    alert("配置保存成功！");
  } catch (error) {
    console.error("Failed to save settings:", error);
    alert("配置保存失败！");
  } finally {
    isSaving.value = false;
  }
};

onMounted(async () => {
  await loadSettings();

  window.api.onStatusChange((newStatus: boolean) => {
    status.value = newStatus ? "已连接" : "未连接";
    if (newStatus) {
      isLaunched.value = true;
    } else {
      isLaunched.value = false;
      playstatus.value = null;
      oscStatus.value = false;
      isStarting.value = false;
    }
  });

  window.api.playState((state) => {
    playstatus.value = state;
  });

  window.api.onOscOutput((data) => {
    oscOutput.value = data;
    console.log("[Home] OSC Output:", data);
  });
});
</script>

<template>
  <div class="p-3">
    <div class="space-y-2">
      <div class="flex flex-col mb-4">
        <div class="flex gap-4">
          <n-text>NCM: {{ status }}</n-text>
          <n-text>OSC: {{ oscStatus ? "运行中" : "已停止" }}</n-text>
        </div>
        <div class="flex mt-1 gap-2 overflow-hidden">
          <n-text class="shrink-0">网易云路径：</n-text>
          <n-text class="truncate">{{ formData.ncmPath }}</n-text>
        </div>
      </div>

      <div class="flex gap-2 mb-4">
        <n-button @click="handleLaunch" :loading="isLaunching">
          {{ isLaunched ? "关闭网易云" : "启动网易云" }}
        </n-button>
        <n-button @click="doBrowse">选择路径</n-button>
        <n-button
          @click="toggleOsc"
          :disabled="!isLaunched"
          :loading="isStarting"
          :type="oscStatus ? 'warning' : 'primary'"
        >
          {{ oscStatus ? "停止OSC" : "启动OSC" }}
        </n-button>
        <n-button @click="saveSettings" :loading="isSaving">保存配置</n-button>
      </div>

      <n-card size="small" content-style="padding: 0;">
        <n-tabs type="line" size="large" :tabs-padding="20" pane-style="padding: 20px;" animated>
          <n-tab-pane name="基础配置">
            <n-form :model="formData">
              <n-grid :cols="2" :x-gap="12" :y-gap="12">
                <n-form-item-gi label="OSC IP" path="osc.ip" :show-feedback="false">
                  <n-input v-model:value="formData.osc.ip" type="text" />
                </n-form-item-gi>
                <n-form-item-gi label="OSC Port" path="osc.port" :show-feedback="false">
                  <n-input-number v-model:value="formData.osc.port" />
                </n-form-item-gi>
                <n-form-item-gi label="刷新间隔" path="refresh.interval" :show-feedback="false">
                  <n-input-number v-model:value="formData.refresh.interval" :min="0.5" :max="60">
                    <template #suffix>秒</template>
                  </n-input-number>
                </n-form-item-gi>
              </n-grid>
            </n-form>
          </n-tab-pane>
          <n-tab-pane name="进度条设置">
            <n-form :model="formData">
              <n-grid :cols="2" :x-gap="12" :y-gap="12">
                <n-form-item-gi label="宽度" path="bar.width" :show-feedback="false">
                  <n-input-number v-model:value="formData.bar.width" :min="5" :max="100" />
                </n-form-item-gi>
                <n-form-item-gi label="已播放" path="bar.filled" :show-feedback="false">
                  <n-input v-model:value="formData.bar.filled" type="text" maxlength="1" />
                </n-form-item-gi>
                <n-form-item-gi label="滑块" path="bar.thumb" :show-feedback="false">
                  <n-input v-model:value="formData.bar.thumb" type="text" maxlength="1" />
                </n-form-item-gi>
                <n-form-item-gi label="未播放" path="bar.empty" :show-feedback="false">
                  <n-input v-model:value="formData.bar.empty" type="text" maxlength="1" />
                </n-form-item-gi>
              </n-grid>
            </n-form>
          </n-tab-pane>
        </n-tabs>
      </n-card>

      <n-card
        title="输出模板"
        size="small"
        content-style="padding: 20px; padding-top: 0;"
        header-style="padding-top: 20px; padding-left: 20px;"
      >
        <n-form :model="formData">
          <n-form-item
            label="可用变量：{song} {artist} {bar} {time} {lyric1} {lyric2}"
            path="output.template"
            :show-feedback="false"
          >
            <n-input type="textarea" v-model:value="formData.output.template" rows="3" />
          </n-form-item>
        </n-form>
      </n-card>

      <div>
        <n-card
          title="文本预览"
          size="small"
          content-style="padding: 20px; padding-top: 0;"
          header-style="padding-top: 20px; padding-left: 20px;"
        >
          <pre class="text-xs leading-tight font-mono overflow-auto h-19">{{ preview }}</pre>
        </n-card>
      </div>
      <div>
        <n-card
          title="OSC 输出"
          size="small"
          content-style="padding: 20px; padding-top: 0;"
          header-style="padding-top: 20px; padding-left: 20px;"
        >
          <pre class="text-xs leading-tight font-mono overflow-auto h-19">{{
            oscStatus ? oscOutput : "未开启 OSC"
          }}</pre>
        </n-card>
      </div>
    </div>
  </div>
</template>
