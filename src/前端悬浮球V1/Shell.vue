<template>
  <!-- 悬浮球：折叠态（球 + 悬停下滑的「世界」卫星入口） -->
  <Transition name="th-fab-ball">
    <div
      v-show="!panelOpen"
      class="th-fab-dock"
      :class="{ dragging: ballDragging }"
      :data-skin="ballSkin"
      :style="dockStyle"
    >
      <button
        class="th-fab-ball"
        :class="{ dragging: ballDragging }"
        title="此间天地 · 点击展开 / 拖动可移动"
        @pointerdown="onBallPointerDown"
        @mouseenter="satEnter(); reviewEnter()"
        @mouseleave="satLeave(); reviewLeave()"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3l2.5 5.5L20 9.5l-4 4 1 5.5-5-3-5 3 1-5.5-4-4 5.5-1z" />
        </svg>
        <!-- 右上角角标——已更新但未在变量审核处理的条目数 -->
        <span v-if="reviewPending > 0" class="th-fab-badge">{{ reviewPending > 99 ? '99+' : reviewPending }}</span>
      </button>
      <!-- 悬停世界速览卡——世界信息 + 主角状态 + 在场角色全量字段，卡片内部滚动 -->
      <Transition name="th-fab-pop">
        <div
          v-if="reviewHover"
          ref="snapEl"
          class="th-fab-snap"
          :class="[{ 'on-left': snapOnLeft, pinned: snapPinned, resizing: snapResizing }, snapDaypart]"
          :style="snapStyle"
          @mouseenter="reviewEnter"
          @mouseleave="reviewLeave"
        >
          <!-- 四角缩放手柄（只做四角：四边会压住卡内滚动条 / 贴球侧的间隙）。双击任一角回到自动尺寸。 -->
          <span class="th-fab-snap-rz nw" title="拖动缩放（双击复原）" @pointerdown.stop="onSnapResizeStart($event,'nw')" @dblclick.stop="resetSnapSize"></span>
          <span class="th-fab-snap-rz ne" title="拖动缩放（双击复原）" @pointerdown.stop="onSnapResizeStart($event,'ne')" @dblclick.stop="resetSnapSize"></span>
          <span class="th-fab-snap-rz sw" title="拖动缩放（双击复原）" @pointerdown.stop="onSnapResizeStart($event,'sw')" @dblclick.stop="resetSnapSize"></span>
          <span class="th-fab-snap-rz se" title="拖动缩放（双击复原）" @pointerdown.stop="onSnapResizeStart($event,'se')" @dblclick.stop="resetSnapSize"></span>
          <!-- 表头只放世界信息胶囊 + 操作钮（标题文字去掉，不占位） -->
          <div class="th-fab-snap-head">
            <div v-if="snapshot.world.length" class="th-fab-snap-wchips">
              <span v-for="(f, i) in snapshot.world" :key="'w'+i" class="th-fab-snap-wchip">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="snapWIcon(f)"/></svg>
                <b>{{ f.label }}</b>{{ f.value }}
              </span>
            </div>
            <div class="th-fab-snap-acts">
              <!-- 钉住：鼠标离开不自动收，长文可选中复制 -->
              <button class="th-fab-snap-act" :class="{ on: snapPinned }" :title="snapPinned ? '取消钉住' : '钉住卡片（可选中复制长文）'" @click.stop="toggleSnapPin">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16.5V22"/><path d="M8 3h8l-1.4 7 2.9 3.5H6.5L9.4 10z"/></svg>
              </button>
              <!-- 只在用户拖过尺寸后出现：一键回自动尺寸（等价于双击任一角） -->
              <button v-if="snapW !== null || snapH !== null" class="th-fab-snap-act" title="尺寸复原为自动" @click.stop="resetSnapSize">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H4v5"/><path d="M15 21h5v-5"/><path d="M20 8V4h-4"/><path d="M4 16v4h4"/></svg>
              </button>
              <button class="th-fab-snap-act" title="刷新" @click.stop="refreshSnapshot">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v5h-5"/></svg>
              </button>
              <button v-if="snapPinned" class="th-fab-snap-act" title="关闭" @click.stop="closeSnap">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
          </div>
          <div class="th-fab-snap-body" ref="snapBodyEl">
            <div v-if="!snapshot.hasData" class="th-fab-snap-empty">暂时读不到世界/角色数据。开始对话或让状态栏更新后再看。</div>
            <template v-else>
              <!-- 第一排：主角通栏（立绘左，名字/金钱/属性右；长文与状态穿着在下方一排铺开） -->
              <div v-if="snapHasUser" class="th-fab-snap-col-u">
                <div class="th-fab-snap-ucard">
                  <!-- 头像缩小成小半身，右侧放名字 + 身份/生日等短字段，不再独占一整行高度 -->
                  <div class="th-fab-snap-uhead">
                    <div
                      class="th-fab-snap-ava th-fab-snap-ava-user"
                      :class="{ ph: !snapshot.user.avatar, zoom: !!snapshot.user.avatar }"
                      :style="{ '--ava-c': snapshot.user.color }"
                      :title="snapshot.user.avatar ? '点击看大图' : ''"
                      @click.stop="onSnapAvatarView(snapshot.user.avatar)"
                    >
                      <img v-if="snapshot.user.avatar" :src="snapshot.user.avatar" alt="" />
                      <span v-else>{{ snapshot.user.initial }}</span>
                    </div>
                    <div class="th-fab-snap-uside">
                      <!-- 通栏后名字/短字段/金钱背包挤在一行，纵向省两行 -->
                      <div class="th-fab-snap-urow">
                        <span class="th-fab-snap-uname">{{ snapshot.user.name || '主角' }}<em>你</em></span>
                        <div v-if="snapshot.user.headline.length" class="th-fab-snap-hls">
                          <span v-for="(f, i) in snapshot.user.headline" :key="'uh'+i" class="th-fab-snap-hl"><b>{{ f.label }}</b>{{ f.value }}</span>
                        </div>
                        <!-- 金钱 + 背包/技能（明细走状态栏现成 hover 浮窗，不占卡内高度） -->
                        <div class="th-fab-snap-ubag">
                          <span class="th-fab-snap-money" title="金钱">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18"/></svg>
                            {{ snapshot.user.money }}
                          </span>
                          <button class="th-fab-snap-mini" title="背包（悬停看明细）" @mouseenter="onSnapBagEnter($event, 'item')" @mouseleave="onSnapBagLeave" @click.stop>
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18v13H3z"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/></svg>
                            背包<i>{{ snapshot.user.itemCount }}</i>
                          </button>
                          <button class="th-fab-snap-mini" title="技能（悬停看明细）" @mouseenter="onSnapBagEnter($event, 'skill')" @mouseleave="onSnapBagLeave" @click.stop>
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z"/><path d="M6 4a2 2 0 0 0-2 2v12"/></svg>
                          技能<i>{{ snapshot.user.skillCount }}</i>
                          </button>
                        </div>
                      </div>
                      <!-- 属性挪到立绘右侧（这里宽 900px，六列铺开不再堆三行） -->
                      <div v-if="snapshot.user.attrs.length" class="th-fab-snap-grp">
                        <span class="th-fab-snap-grp-t">修行属性</span>
                        <div class="th-fab-snap-attrs">
                          <span
                            v-for="(a, i) in snapshot.user.attrs"
                            :key="'ua'+i"
                            class="th-fab-snap-attr"
                            :class="[a.cls, { top: i < 3 }]"
                            :style="snapAttrStyle(a, i)"
                          >
                            <b>{{ a.name }}</b><i>{{ a.value }}</i>
                          </span>
                        </div>
                      </div>
                      <!-- 状态 + 穿着并排（各自内部多列小卡）：跟在属性下面，吃满立绘右侧 900px -->
                      <div v-if="snapshot.user.status.length || snapshot.user.clothing.length" class="th-fab-snap-urow2">
                        <div v-if="snapshot.user.status.length" class="th-fab-snap-grp">
                          <span class="th-fab-snap-grp-t">状态</span>
                          <div class="th-fab-snap-cards">
                            <span v-for="(s, i) in snapshot.user.status" :key="'us'+i" class="th-fab-snap-card th-fab-snap-card-st">
                              <span class="th-fab-snap-card-r1"><b>{{ s.name }}</b><em v-if="s.duration">{{ s.duration }}</em></span>
                              <span v-if="s.effect || s.source" class="th-fab-snap-card-r2"><i v-if="s.effect">{{ s.effect }}</i><u v-if="s.source">{{ s.source }}</u></span>
                            </span>
                          </div>
                        </div>
                        <div v-if="snapshot.user.clothing.length" class="th-fab-snap-grp th-fab-snap-grp-cl">
                          <span class="th-fab-snap-grp-t">穿着</span>
                          <div class="th-fab-snap-cards">
                            <span
                              v-for="(c, i) in snapshot.user.clothing"
                              :key="'uc'+i"
                              class="th-fab-snap-card th-fab-snap-card-cl"
                              :class="[snapDmgCls(c.dmg), { off: c.wear === '脱下' }]"
                              title="悬停看外观详情"
                              @mouseenter="onSnapClothEnter($event, '', c.name)"
                              @mouseleave="onSnapBagLeave"
                            >
                              <span class="th-fab-snap-cl-r1">
                                <svg class="th-fab-snap-cl-ico" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3l4 3 4-3 3 2-2 5v11H7V10L5 5z"/></svg>
                                <b>{{ c.name }}</b>
                                <span v-if="c.part" class="th-fab-snap-cl-part">{{ c.part }}</span>
                              </span>
                              <span class="th-fab-snap-cl-r2">
                                <span class="th-fab-snap-cl-wear">{{ c.wear || '穿着' }}</span>
                                <span class="th-fab-snap-cl-dmg" :title="'破损状态：' + (c.dmg || '完好无缺')">
                                  <s class="th-fab-snap-pips"><i></i><i></i><i></i></s>{{ c.dmg || '完好无缺' }}
                                </span>
                              </span>
                              <span v-if="c.state" class="th-fab-snap-cl-state" :title="'衣物状态：' + c.state">
                                <em>{{ c.state }}</em>
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- 主角长文：通栏两列（姿态动作 / 身体状态），零截断 -->
                  <div v-if="snapshot.user.fields.length" class="th-fab-snap-ubody">
                    <div
                      v-for="(f, i) in snapshot.user.fields"
                      :key="'u'+i"
                      class="th-fab-snap-field"
                      :class="snapFieldCls(f.label)"
                    >
                      <span class="th-fab-snap-flabel">{{ f.label }}</span>
                      <span class="th-fab-snap-fval">{{ f.value }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <!-- 右栏：在场角色（立绘 + 铭牌 + 心情/五值，长文两列铺开） -->
              <div v-if="snapshot.present.length" class="th-fab-snap-col-n">
                <div class="th-fab-snap-sec-h">
                  <span class="th-fab-snap-sec-t">在场角色<em>{{ snapshot.present.length }}</em></span>
                  <!-- 多人在场时的快速导航：小圆头像点击滚到对应卡 -->
                  <span v-if="snapshot.present.length > 1" class="th-fab-snap-nav">
                    <button
                      v-for="(n, ni) in snapshot.present"
                      :key="'nav'+ni"
                      class="th-fab-snap-navdot"
                      :class="{ ph: !n.avatar }"
                      :style="{ '--ava-c': n.color }"
                      :title="n.name"
                      @click.stop="scrollToNpc(ni)"
                    >
                      <img v-if="n.avatar" :src="n.avatar" alt="" />
                      <span v-else>{{ n.initial }}</span>
                    </button>
                  </span>
                </div>
                <div class="th-fab-snap-npc-list">
                  <div
                    v-for="(n, ni) in snapshot.present"
                    :key="'n'+ni"
                    class="th-fab-snap-npc"
                    :ref="el => setNpcRef(el, ni)"
                    :style="snapNpcStyle(n, ni)"
                  >
                    <div class="th-fab-snap-npc-head">
                      <!-- 左列：只放立绘（250×334），下面不再挂竖排小卡，避免右侧留大片空白 -->
                      <div class="th-fab-snap-npc-left">
                        <div
                          class="th-fab-snap-ava th-fab-snap-ava-npc"
                          :class="{ ph: !n.avatar, zoom: !!n.avatar }"
                          :style="{ '--ava-c': n.color }"
                          :title="n.avatar ? '点击看大图' : '点击去详情设置头像'"
                          @click.stop="n.avatar ? onSnapAvatarView(n.avatar) : onSnapNpcClick(n.name)"
                        >
                          <img v-if="n.avatar" :src="n.avatar" alt="" />
                          <span v-else>{{ n.initial }}</span>
                          <!-- 铭牌压在立绘底部：省一整行名字高度 -->
                          <span class="th-fab-snap-plate">{{ n.name }}</span>
                          <!-- 画廊入口：立绘右上角；0 张也能进（弹窗里有 + 添加） -->
                          <button
                            class="th-fab-snap-gallery"
                            :class="{ empty: !n.galleryCount }"
                            @click.stop="onSnapGalleryClick(n.name)"
                            :title="n.galleryCount ? '画廊 (' + n.galleryCount + ')' : '画廊（暂无图片，可添加）'"
                          >
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                            <span v-if="n.galleryCount" class="th-fab-snap-gallery-cnt">{{ n.galleryCount }}</span>
                          </button>
                        </div>
                      </div>
                      <div class="th-fab-snap-npc-head-main">
                        <div class="th-fab-snap-npc-top">
                          <button class="th-fab-snap-npc-name" @click.stop="onSnapNpcClick(n.name)" :title="'查看 ' + n.name + ' 详情'">
                            详情
                            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                          </button>
                          <span v-for="(f, fi) in n.headline" :key="'nh'+fi" class="th-fab-snap-hl"><b>{{ f.label }}</b>{{ f.value }}</span>
                          <span v-for="(c, ci) in n.counts" :key="'ncnt'+ci" class="th-fab-snap-cnt">
                            <b>{{ c.label }}</b><i>{{ c.value }}</i>
                          </span>
                        </div>
                        <!-- 心情浮帖 -->
                        <div v-if="n.moodTags.length" class="th-fab-snap-moods">
                          <span v-for="(t, ti) in n.moodTags" :key="'nmt'+ti" class="th-fab-snap-mood">{{ t }}</span>
                        </div>
                        <!-- 情感值：标签+条+数值三段栅格，一眼横向对比 -->
                        <div v-if="n.metrics.length" class="th-fab-snap-metrics">
                          <span
                            v-for="(m, mi) in n.metrics"
                            :key="'nm'+mi"
                            class="th-fab-snap-metric"
                            :class="[m.cls, { hi: m.value >= 80 }]"
                            :style="{ '--p': m.value + '%' }"
                            :title="m.key + ' ' + m.value + ' / 100'"
                          >
                            <b>{{ m.label }}</b><s></s><i>{{ m.value }}</i>
                          </span>
                        </div>
                        <!-- 状态 + 穿着：立绘右侧这块宽 ~750px，两组并排、组内小卡自动多列铺满 -->
                        <div v-if="n.status.length || n.clothing.length" class="th-fab-snap-npc-cards">
                          <div v-if="n.status.length" class="th-fab-snap-grp">
                            <span class="th-fab-snap-grp-t">状态</span>
                            <div class="th-fab-snap-cards">
                              <span v-for="(s, si) in n.status" :key="'ns'+si" class="th-fab-snap-card th-fab-snap-card-st">
                                <span class="th-fab-snap-card-r1"><b>{{ s.name }}</b><em v-if="s.duration">{{ s.duration }}</em></span>
                                <span v-if="s.effect || s.source" class="th-fab-snap-card-r2"><i v-if="s.effect">{{ s.effect }}</i><u v-if="s.source">{{ s.source }}</u></span>
                              </span>
                            </div>
                          </div>
                          <!-- 穿着：双层小卡 + 悬停看外观详情（长文不进快照，浮窗现读） -->
                          <div v-if="n.clothing.length" class="th-fab-snap-grp th-fab-snap-grp-cl">
                            <span class="th-fab-snap-grp-t">穿着</span>
                            <div class="th-fab-snap-cards">
                              <span
                                v-for="(c, ci) in n.clothing"
                                :key="'nc'+ci"
                                class="th-fab-snap-card th-fab-snap-card-cl"
                                :class="[snapDmgCls(c.dmg), { off: c.wear === '脱下' }]"
                                title="悬停看外观详情"
                                @mouseenter="onSnapClothEnter($event, n.name, c.name)"
                                @mouseleave="onSnapBagLeave"
                              >
                                <span class="th-fab-snap-cl-r1">
                                  <svg class="th-fab-snap-cl-ico" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3l4 3 4-3 3 2-2 5v11H7V10L5 5z"/></svg>
                                  <b>{{ c.name }}</b>
                                  <span v-if="c.part" class="th-fab-snap-cl-part">{{ c.part }}</span>
                                </span>
                                <span class="th-fab-snap-cl-r2">
                                  <span class="th-fab-snap-cl-wear">{{ c.wear || '穿着' }}</span>
                                  <span class="th-fab-snap-cl-dmg" :title="'破损状态：' + (c.dmg || '完好无缺')">
                                    <s class="th-fab-snap-pips"><i></i><i></i><i></i></s>{{ c.dmg || '完好无缺' }}
                                  </span>
                                </span>
                                <span v-if="c.state" class="th-fab-snap-cl-state" :title="'衣物状态：' + c.state">
                                  <em>{{ c.state }}</em>
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <!-- 下半：四段长文田字格（本能渴望/姿态动作 上排，内心想法/身体状态 下排），零截断 -->
                    <div v-if="n.fields.length" class="th-fab-snap-npc-body">
                      <div v-for="(f, fi) in n.fields" :key="'nf'+fi" class="th-fab-snap-field" :class="snapFieldCls(f.label)">
                        <span class="th-fab-snap-flabel">{{ f.label }}</span>
                        <span class="th-fab-snap-fval">{{ f.value }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </Transition>
      <button
        class="th-fab-sat"
        :class="{ show: satOpen && !ballDragging }"
        title="进入「世界」"
        @pointerdown.stop
        @click.stop="openWorldFromBall"
        @mouseenter="satEnter"
        @mouseleave="satLeave"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
        </svg>
      </button>
    </div>
  </Transition>

  <!-- 展开窗口：状态栏外壳 -->
  <!-- 常驻渲染（不用 v-show 的 display:none）：世界 modal 的 overlay 嵌在本面板内的 .th-status-wrapper 里，
       display:none 会连世界一起隐藏。折叠态改挂 .collapsed，只隐藏可见区+中和外框，overlay 仍可弹出。 -->
  <div
    ref="panelRef"
    class="th-fab-panel"
    :class="{ dragging: panelDragging, maximized, resizing: !!resizeDir, collapsed: !panelOpen, folded: panelFolded }"
    :style="panelStyle"
  >
    <!-- 外框窄条已删除（v3）：标题/最大化/收起三件事平移进状态栏顶栏
         —— 标题「此间天地」点击 = 收起为球，左皇冠 = 全屏/还原，右皇冠 = 折叠正文，顶栏空白 = 拖动。
         顶栏是 innerHTML 注入的静态骨架，桥接见 bindTopbarControls()。 -->

    <!-- 状态栏宿主：HTML 在 onMounted 后注入 -->
    <div ref="bodyRef" class="th-fab-panel-body"></div>

    <!-- 8 个缩放控制点（边 + 角） -->
    <template v-if="!maximized">
      <span class="th-fab-resize n"  @pointerdown.stop="onResizeStart($event,'n')"></span>
      <span class="th-fab-resize s"  @pointerdown.stop="onResizeStart($event,'s')"></span>
      <span class="th-fab-resize e"  @pointerdown.stop="onResizeStart($event,'e')"></span>
      <span class="th-fab-resize w"  @pointerdown.stop="onResizeStart($event,'w')"></span>
      <span class="th-fab-resize ne" @pointerdown.stop="onResizeStart($event,'ne')"></span>
      <span class="th-fab-resize nw" @pointerdown.stop="onResizeStart($event,'nw')"></span>
      <span class="th-fab-resize se" @pointerdown.stop="onResizeStart($event,'se')"></span>
      <span class="th-fab-resize sw" @pointerdown.stop="onResizeStart($event,'sw')"></span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { setupStatusBar, getWorldSnapshot, openNpcFromSnapshot, openGalleryFromSnapshot, snapExtraAttrColor, snapUserBagHover, snapHoverTipHide, snapViewImage, snapClothingHover, type WorldSnapshot } from './status-bar-init';
import statusBarRawHtml from './status-bar.html?raw';
import { getWorldConfig } from './lib/world/world-store';
import { getPendingCount, subscribeReview } from './lib/variable-review';

// ─── 宿主 window（脚本运行在后台 iframe，必须用 parent） ───
const hostWindow: Window = (() => {
  try { const w = window.parent as Window; if (w) return w; } catch (e) { void e; }
  return window;
})();
const hostDoc: Document = hostWindow.document;
const hostStorage: Storage | null = (() => {
  try { return hostWindow.localStorage; } catch (e) { void e; return null; }
})();

// ─── 常量 ───
// 注意：key 末尾 _v2 防止和其他悬浮球脚本共享 localStorage（避免两边互相覆盖状态）
const STORAGE_KEY = '_th_fab_state_v2';
const EDGE_GAP = 8;       // 距视口边缘最小距离
const BALL_SIZE = 48;
const PANEL_MIN_W = 360;
const PANEL_MIN_H = 420;
const DEFAULT_W = 880;
const DEFAULT_H = 640;
const DRAG_THRESHOLD = 3;
// 速览卡四角缩放下限（比面板小：卡片本身是浮层，允许收得更窄当便签用）
const SNAP_MIN_W = 320;
const SNAP_MIN_H = 200;

// ─── 视口尺寸（监听 resize 保持边界 clamp） ───
const winW = ref(hostWindow.innerWidth);
const winH = ref(hostWindow.innerHeight);
function syncWinSize() {
  winW.value = hostWindow.innerWidth;
  winH.value = hostWindow.innerHeight;
  clampAll();
}

// ─── 持久化的状态 ───
interface PersistState {
  ballX: number;
  ballY: number;
  panelX: number;
  panelY: number;
  panelW: number;
  panelH: number;
  panelOpen: boolean;
  maximized: boolean;
  lastNormalRect?: { x: number; y: number; w: number; h: number } | null;
  // 速览卡用户拖过的尺寸；null = 没拖过，走自动尺寸（1080 宽 / 视口 86% 高）
  snapW?: number | null;
  snapH?: number | null;
}
function defaultState(): PersistState {
  const w = Math.min(DEFAULT_W, Math.max(PANEL_MIN_W, hostWindow.innerWidth - 80));
  const h = Math.min(DEFAULT_H, Math.max(PANEL_MIN_H, hostWindow.innerHeight - 80));
  return {
    ballX: Math.max(EDGE_GAP, hostWindow.innerWidth - BALL_SIZE - 20),
    ballY: Math.max(EDGE_GAP, Math.round(hostWindow.innerHeight * 0.35)),
    panelX: Math.max(EDGE_GAP, Math.round((hostWindow.innerWidth - w) / 2)),
    panelY: Math.max(EDGE_GAP, Math.round((hostWindow.innerHeight - h) / 2)),
    panelW: w,
    panelH: h,
    panelOpen: false,
    maximized: false,
    lastNormalRect: null,
    snapW: null,
    snapH: null,
  };
}
function loadState(): PersistState {
  const def = defaultState();
  if (!hostStorage) return def;
  try {
    const raw = hostStorage.getItem(STORAGE_KEY);
    if (!raw) return def;
    const obj = JSON.parse(raw) as Partial<PersistState>;
    return {
      ballX: Number.isFinite(obj.ballX) ? (obj.ballX as number) : def.ballX,
      ballY: Number.isFinite(obj.ballY) ? (obj.ballY as number) : def.ballY,
      panelX: Number.isFinite(obj.panelX) ? (obj.panelX as number) : def.panelX,
      panelY: Number.isFinite(obj.panelY) ? (obj.panelY as number) : def.panelY,
      panelW: Number.isFinite(obj.panelW) ? (obj.panelW as number) : def.panelW,
      panelH: Number.isFinite(obj.panelH) ? (obj.panelH as number) : def.panelH,
      panelOpen: !!obj.panelOpen,
      maximized: !!obj.maximized,
      lastNormalRect: (obj.lastNormalRect && typeof obj.lastNormalRect === 'object') ? obj.lastNormalRect as PersistState['lastNormalRect'] : null,
      snapW: Number.isFinite(obj.snapW) ? (obj.snapW as number) : null,
      snapH: Number.isFinite(obj.snapH) ? (obj.snapH as number) : null,
    };
  } catch (e) { void e; return def; }
}
let __saveTimer: number | null = null;
function saveState() {
  if (!hostStorage) return;
  if (__saveTimer !== null) { try { hostWindow.clearTimeout(__saveTimer); } catch(e){ void e; } }
  __saveTimer = hostWindow.setTimeout(() => {
    try {
      hostStorage.setItem(STORAGE_KEY, JSON.stringify({
        ballX: ballX.value, ballY: ballY.value,
        panelX: panelX.value, panelY: panelY.value,
        panelW: panelW.value, panelH: panelH.value,
        panelOpen: panelOpen.value,
        maximized: maximized.value,
        lastNormalRect: lastNormalRect.value,
        snapW: snapW.value, snapH: snapH.value,
      }));
    } catch (e) { void e; }
    __saveTimer = null;
  }, 200);
}

// ─── 响应式状态 ───
const init = loadState();
const ballX = ref(init.ballX);
const ballY = ref(init.ballY);
const panelX = ref(init.panelX);
const panelY = ref(init.panelY);
const panelW = ref(init.panelW);
const panelH = ref(init.panelH);
const panelOpen = ref(init.panelOpen);
const maximized = ref(init.maximized);
const lastNormalRect = ref<PersistState['lastNormalRect']>(init.lastNormalRect);
// 速览卡尺寸：null = 自动（贴球那侧的可用宽 / 视口 86% 高）；非 null = 用户四角拖过的固定值
const snapW = ref<number | null>(init.snapW ?? null);
const snapH = ref<number | null>(init.snapH ?? null);

// ─── clamp 工具 ───
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function clampBall() {
  const maxX = Math.max(EDGE_GAP, winW.value - BALL_SIZE - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, winH.value - BALL_SIZE - EDGE_GAP);
  ballX.value = clamp(ballX.value, EDGE_GAP, maxX);
  ballY.value = clamp(ballY.value, EDGE_GAP, maxY);
}
function clampPanelSize() {
  panelW.value = clamp(panelW.value, PANEL_MIN_W, Math.max(PANEL_MIN_W, winW.value - EDGE_GAP * 2));
  panelH.value = clamp(panelH.value, PANEL_MIN_H, Math.max(PANEL_MIN_H, winH.value - EDGE_GAP * 2));
}
function clampPanelPos() {
  const maxX = Math.max(EDGE_GAP, winW.value - panelW.value - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, winH.value - panelH.value - EDGE_GAP);
  panelX.value = clamp(panelX.value, EDGE_GAP, maxX);
  panelY.value = clamp(panelY.value, EDGE_GAP, maxY);
}
function clampAll() {
  clampBall();
  if (maximized.value) {
    panelX.value = EDGE_GAP; panelY.value = EDGE_GAP;
    panelW.value = Math.max(PANEL_MIN_W, winW.value - EDGE_GAP * 2);
    panelH.value = Math.max(PANEL_MIN_H, winH.value - EDGE_GAP * 2);
  } else {
    clampPanelSize();
    clampPanelPos();
  }
}

// ─── 样式 ───
const dockStyle = computed(() => ({ left: `${ballX.value}px`, top: `${ballY.value}px`, width: `${BALL_SIZE}px`, height: `${BALL_SIZE}px` }));
const panelStyle = computed(() => ({
  left: `${panelX.value}px`,
  top: `${panelY.value}px`,
  width: `${panelW.value}px`,
  height: `${panelH.value}px`,
}));

// ─── 悬浮球：拖动 + 点击展开 ───
const ballDragging = ref(false);
let ballDragStart = { x: 0, y: 0 };
let ballDragBase = { x: 0, y: 0 };
let ballMoved = false;
function onBallPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  ballMoved = false;
  ballDragStart = { x: e.clientX, y: e.clientY };
  ballDragBase = { x: ballX.value, y: ballY.value };
  hostWindow.addEventListener('pointermove', onBallPointerMove);
  hostWindow.addEventListener('pointerup', onBallPointerUp, { once: true });
}
function onBallPointerMove(e: PointerEvent) {
  const dx = e.clientX - ballDragStart.x;
  const dy = e.clientY - ballDragStart.y;
  if (!ballMoved && Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) return;
  ballMoved = true;
  ballDragging.value = true;
  ballX.value = ballDragBase.x + dx;
  ballY.value = ballDragBase.y + dy;
  clampBall();
}
function onBallPointerUp() {
  hostWindow.removeEventListener('pointermove', onBallPointerMove);
  ballDragging.value = false;
  if (!ballMoved) {
    panelOpen.value = true;
  }
  saveState();
}

// ─── 悬浮球皮肤（跟随世界套件「主题外观」设置，事件实时换肤）───
const ballSkin = ref('crystal');
function syncBallSkin() {
  try { ballSkin.value = getWorldConfig().ballSkin || 'crystal'; } catch (e) { void e; }
}

// ─── 悬停下滑的「世界」卫星入口 ───
const satOpen = ref(false);
let satTimer: number | null = null;
function satEnter() {
  if (satTimer !== null) { try { hostWindow.clearTimeout(satTimer); } catch (e) { void e; } satTimer = null; }
  satOpen.value = true;
}
function satLeave() {
  // 小延时：允许指针从球滑到卫星图标之间的空隙不收起
  satTimer = hostWindow.setTimeout(() => { satOpen.value = false; satTimer = null; }, 150);
}
async function openWorldFromBall() {
  satOpen.value = false;
  // 不再连带展开主面板：面板常驻渲染（折叠态透明不拦截），世界 overlay 可直接弹出。
  await nextTick();
  try { (window as any).__th_world_app__?.openWorldApp?.(); } catch (e) { void e; }
}

// ─── 变量审核角标 + 悬停世界速览卡 ───
// 角标：已更新但还没在「变量审核」里处理（pending）的条目数。
// 悬停球时弹「世界速览卡」：世界信息 + 主角状态 + 在场角色全量字段。
const reviewPending = ref(0);
const reviewHover = ref(false);
let reviewUnsub: (() => void) | null = null;
let reviewHoverTimer: number | null = null;
function refreshReviewBadge() {
  try { reviewPending.value = getPendingCount(); } catch (e) { void e; reviewPending.value = 0; }
}
// 世界速览快照（hover 时现读一次）
const EMPTY_SNAP: WorldSnapshot = { world: [], user: { name: '', avatar: '', initial: '', color: '', headline: [], moodTags: [], fields: [], attrs: [], metrics: [], counts: [], status: [], clothing: [], galleryCount: 0, money: 0, itemCount: 0, skillCount: 0 }, present: [], hasData: false };
const snapshot = ref<WorldSnapshot>(EMPTY_SNAP);
function refreshSnapshot() {
  try { snapshot.value = getWorldSnapshot(); } catch (e) { void e; snapshot.value = EMPTY_SNAP; }
}
function onSnapNpcClick(name: string) {
  try { openNpcFromSnapshot(name); } catch (e) { void e; }
}
function onSnapGalleryClick(name: string) {
  try { openGalleryFromSnapshot(name); } catch (e) { void e; }
}
// 点立绘 → 复用状态栏大图查看器（详情走旁边的「详情」钮，不再跳转）
function onSnapAvatarView(url: string) {
  if (!url) return;
  try { snapViewImage(url); } catch (e) { void e; }
}
// 主角背包/技能：明细复用状态栏现成 hover 浮窗（现读变量，不进快照）
function onSnapBagEnter(e: MouseEvent, kind: 'item' | 'skill') {
  const el = (e.currentTarget as HTMLElement) || null;
  if (!el) return;
  try { snapUserBagHover(el, kind); } catch (err) { void err; }
}
function onSnapBagLeave() {
  try { snapHoverTipHide(); } catch (e) { void e; }
}
// 衣物小卡悬停 → 复用状态栏衣物浮窗（外观详情/衣物状态/评价 现读，不进快照）。npcName 空串=主角
function onSnapClothEnter(e: MouseEvent, npcName: string, clothingName: string) {
  const el = (e.currentTarget as HTMLElement) || null;
  if (!el) return;
  try { snapClothingHover(el, npcName, clothingName); } catch (err) { void err; }
}
// 钉住：鼠标离开不自动收起，长文可选中复制。
const snapPinned = ref(false);
function toggleSnapPin() { snapPinned.value = !snapPinned.value; }
function closeSnap() { snapPinned.value = false; reviewHover.value = false; }
function reviewEnter() {
  if (reviewHoverTimer !== null) { try { hostWindow.clearTimeout(reviewHoverTimer); } catch (e) { void e; } reviewHoverTimer = null; }
  refreshSnapshot();
  reviewHover.value = true;
}
function reviewLeave() {
  if (snapPinned.value) return;
  // 卡片收起时顺手关掉背包/技能浮窗（浮窗 portal 在 body 上，不会随卡片一起消失）
  reviewHoverTimer = hostWindow.setTimeout(() => { reviewHover.value = false; reviewHoverTimer = null; onSnapBagLeave(); }, 160);
}

// ─── 速览卡表现层小工具（纯展示派生，不引入新数据源）───
// 表头世界胶囊图标：按 label 走已有四项（日期/时间/天气/所处区域/具体位置）。
const SNAP_W_ICON: Record<string, string> = {
  日期: 'M8 2v4M16 2v4M3 9h18M4 5h16v16H4z',
  时间: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  天气: 'M5 17a4 4 0 0 1 .6-8A6 6 0 0 1 17 9.5a3.75 3.75 0 0 1-.4 7.5z',
  所处区域: 'M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  具体位置: 'M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
};
function snapWIcon(f: { label: string }): string { return SNAP_W_ICON[f.label] || SNAP_W_ICON['所处区域']; }
// 主角栏是否有内容（双栏布局：无内容时右栏独占整宽）
const snapHasUser = computed(() => {
  const u = snapshot.value.user;
  return u.headline.length > 0 || u.fields.length > 0 || u.attrs.length > 0 || u.status.length > 0 || u.clothing.length > 0;
});
// 昼夜氛围：从世界「时间」字段取小时，给表头一层极淡的晨/昼/暮/夜色；解析失败不加 class（降级安全）。
const snapDaypart = computed(() => {
  const t = snapshot.value.world.find(w => w.label === '时间')?.value || '';
  const h = Number((t.match(/(\d{1,2})\s*[:：时点]/) || [])[1]);
  if (!Number.isFinite(h)) return '';
  if (h < 5 || h >= 21) return 'dp-night';
  if (h < 9) return 'dp-dawn';
  if (h < 17) return 'dp-day';
  return 'dp-dusk';
});
// 长文本字段：内心想法走引文样式，其余走「小标题在上、正文整宽在下」。
function snapFieldCls(label: string): string {
  if (label === '内心想法') return 'th-fab-snap-field-quote';
  return label === '身体状态' || label === '本能渴望' || label === '姿态动作' ? 'th-fab-snap-field-long' : '';
}
// 属性胶囊：自身即进度条（stop 在 pct%），自定义属性（cls 空）沿用现成调色板。
function snapAttrStyle(a: { pct: number; cls: string }, i: number): Record<string, string> {
  const st: Record<string, string> = { '--p': `${a.pct}%` };
  if (!a.cls) st['--ac'] = snapExtraAttrColor(i);
  return st;
}
// 衣物破损色阶：四档枚举 → 四个类，完好也有自己的色（绿），别再和"未知"共用中性色。
// 键跟 status-bar-init 的 CLOTHING_DMG_ORDER 一一对应，改枚举要同步这里。
const SNAP_DMG_CLS: Record<string, string> = { 完好无缺: 'dmg0', 轻微破损: 'dmg1', 中度破损: 'dmg2', 严重破坏: 'dmg3' };
function snapDmgCls(dmg: string): string { return SNAP_DMG_CLS[dmg] || 'dmg0'; }
// 情感氛围光：五值合成 NPC 卡外缘光色 —— 情欲/兴奋高→桃红，羞耻高→冷蓝，心动高→暖粉。
function snapNpcStyle(n: { metrics: { key: string; value: number }[] }, idx: number): Record<string, string> {
  const v = (k: string) => n.metrics.find(m => m.key === k)?.value || 0;
  const heat = Math.max(v('情欲值'), v('兴奋值'));
  const shy = v('羞耻值');
  const love = v('心动值');
  const peak = Math.max(heat, shy, love);
  const hue = heat >= shy && heat >= love ? '340, 92%, 62%' : shy > love ? '224, 76%, 64%' : '350, 100%, 74%';
  return { '--aura': `hsla(${hue}, ${(0.05 + (peak / 100) * 0.3).toFixed(3)})`, '--stagger': `${Math.min(idx, 6) * 40}ms` };
}
// NPC 卡 ref 表 + 导航条点击滚动。
const snapBodyEl = ref<HTMLElement | null>(null);
const snapEl = ref<HTMLElement | null>(null);   // 速览卡根节点（四角缩放起拖时读实际尺寸）
const npcEls: (HTMLElement | null)[] = [];
function setNpcRef(el: any, idx: number) { npcEls[idx] = (el as HTMLElement) || null; }
function scrollToNpc(idx: number) {
  const el = npcEls[idx];
  const box = snapBodyEl.value;
  if (!el || !box) return;
  box.scrollTo({ top: Math.max(0, el.offsetTop - box.offsetTop - 8), behavior: 'smooth' });
}
// 速览卡贴边方向：球在视口右半 → 卡出现在球左侧；球在左半 → 出现在右侧。垂直方向 clamp 进视口。
const SNAP_GAP = 14;  // 卡与球水平间距（卡宽见 CSS：双栏 1080px / max-width 94vw）
const snapOnLeft = computed(() => (ballX.value + BALL_SIZE / 2) > winW.value / 2);
// 贴球那一侧的可用宽/高（四角缩放的上限，也是自动尺寸的夹取上限）
const snapAvailW = computed(() => Math.max(SNAP_MIN_W, Math.round(snapOnLeft.value
  ? ballX.value - SNAP_GAP - EDGE_GAP
  : winW.value - (ballX.value + BALL_SIZE) - SNAP_GAP - EDGE_GAP)));
const snapAvailH = computed(() => Math.max(SNAP_MIN_H, winH.value - EDGE_GAP * 2));
const snapStyle = computed(() => {
  // 水平：贴对侧
  const horiz: Record<string, string> = snapOnLeft.value
    ? { right: `${BALL_SIZE + SNAP_GAP}px`, left: 'auto' }
    : { left: `${BALL_SIZE + SNAP_GAP}px`, right: 'auto' };
  // 垂直：以球中心为锚，clamp 让卡完整落在视口内（EDGE_GAP 边距）
  // 用户拖过尺寸就用它（夹进可用范围），没拖过走原来的自动档
  const cardH = snapH.value !== null
    ? clamp(snapH.value, SNAP_MIN_H, snapAvailH.value)
    : Math.min(snapAvailH.value, Math.round(winH.value * 0.86));
  const ballCenterY = ballY.value + BALL_SIZE / 2;
  let topPx = ballCenterY - cardH / 2;
  topPx = clamp(topPx, EDGE_GAP, Math.max(EDGE_GAP, winH.value - cardH - EDGE_GAP));
  // 卡相对 dock 定位，故换算成相对球顶的偏移
  const size: Record<string, string> = snapW.value !== null
    ? { width: `${clamp(snapW.value, SNAP_MIN_W, snapAvailW.value)}px`, maxWidth: `${snapAvailW.value}px` }
    // 宽度仍由 CSS 的 1080/94vw 决定，这里只夹一次实际可用宽（CSS 的 94vw 不算球占位）
    : { maxWidth: `${snapAvailW.value}px` };
  return {
    ...horiz,
    ...size,
    top: `${Math.round(topPx - ballY.value)}px`,
    // 拖过高度就写死 height（不然内容少时卡不会真的变矮）；没拖过仍只给上限，让卡按内容自适应
    ...(snapH.value !== null ? { height: `${cardH}px` } : {}),
    maxHeight: `${cardH}px`,
  };
});
// ─── 速览卡：四角缩放 ───
// 卡贴在球的对侧、以 right/left 锚定，所以「靠球那一角」拖动改的是尺寸而非位置——
// 四个角都只算 dw/dh，符号按角的方向取，位置交给 snapStyle 重新居中。
type SnapResizeDir = 'nw' | 'ne' | 'sw' | 'se';
const snapResizing = ref(false);
let snapResizeBase = { x: 0, y: 0, w: 0, h: 0, dir: 'se' as SnapResizeDir };
function onSnapResizeStart(e: PointerEvent, dir: SnapResizeDir) {
  if (e.button !== 0) return;
  e.preventDefault();
  const el = snapEl.value;
  const r = el ? el.getBoundingClientRect() : null;
  snapResizeBase = {
    x: e.clientX, y: e.clientY,
    w: r ? Math.round(r.width) : (snapW.value ?? 1080),
    h: r ? Math.round(r.height) : (snapH.value ?? 600),
    dir,
  };
  snapResizing.value = true;
  snapPinned.value = true;  // 缩放期间鼠标必然离开过卡片，先钉住免得半路收起
  hostWindow.addEventListener('pointermove', onSnapResizeMove);
  hostWindow.addEventListener('pointerup', onSnapResizeEnd, { once: true });
}
function onSnapResizeMove(e: PointerEvent) {
  if (!snapResizing.value) return;
  const dx = e.clientX - snapResizeBase.x;
  const dy = e.clientY - snapResizeBase.y;
  const d = snapResizeBase.dir;
  // 宽度符号看「卡钉在球的哪一侧」，不看拖的是哪个角：卡贴球左侧时整卡只能往左长，
  // 于是四个角一律"往左拖=变宽"，光标方向和卡片生长方向始终一致（按角取符号会让贴球那两角反着长）。
  const wSign = snapOnLeft.value ? -1 : 1;
  // 高度是以球中心为锚上下对称生长的（见 snapStyle 的 topPx），所以位移要 ×2 才能让
  // 被拖的那条边贴着光标走：上两角往上拖 = 变高，下两角往下拖 = 变高。
  const hSign = (d === 'nw' || d === 'ne') ? -2 : 2;
  snapW.value = clamp(snapResizeBase.w + dx * wSign, SNAP_MIN_W, snapAvailW.value);
  snapH.value = clamp(snapResizeBase.h + dy * hSign, SNAP_MIN_H, snapAvailH.value);
}
function onSnapResizeEnd() {
  hostWindow.removeEventListener('pointermove', onSnapResizeMove);
  snapResizing.value = false;
  saveState();
}
// 双击任一角：清掉用户尺寸，回到自动档
function resetSnapSize() { snapW.value = null; snapH.value = null; saveState(); }


// ─── 面板：顶栏拖动（v2 起拖动手柄 = 状态栏 .th-topbar 的空白处，外框窄条已删） ───
// 顶栏里塞满了按钮 / 搜索框 / 标题 / 皇冠，全都要先放过去，只有真正的空白才起拖。
const DRAG_IGNORE = [
  'button', 'input', 'select', 'textarea', 'a',
  '.th-topbar-title', '.th-title-crown', '.th-icon-btn',
  '.th-npc-filter-btn', '.th-npc-search-wrap', '.th-menu-popover',
].join(',');
const panelDragging = ref(false);
let panelDragStart = { x: 0, y: 0 };
let panelDragBase = { x: 0, y: 0 };
let panelMoved = false;
function onPanelPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  if (maximized.value) return; // 最大化时禁止拖动
  // 顶栏内按钮 / 控件不触发拖动
  const target = e.target as HTMLElement;
  if (target.closest(DRAG_IGNORE)) return;
  e.preventDefault();
  panelMoved = false;
  panelDragStart = { x: e.clientX, y: e.clientY };
  panelDragBase = { x: panelX.value, y: panelY.value };
  hostWindow.addEventListener('pointermove', onPanelPointerMove);
  hostWindow.addEventListener('pointerup', onPanelPointerUp, { once: true });
}
function onPanelPointerMove(e: PointerEvent) {
  const dx = e.clientX - panelDragStart.x;
  const dy = e.clientY - panelDragStart.y;
  if (!panelMoved && Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) return;
  panelMoved = true;
  panelDragging.value = true;
  panelX.value = panelDragBase.x + dx;
  panelY.value = panelDragBase.y + dy;
  clampPanelPos();
}
function onPanelPointerUp() {
  hostWindow.removeEventListener('pointermove', onPanelPointerMove);
  panelDragging.value = false;
  saveState();
}

// ─── 面板：8 方向缩放 ───
type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const resizeDir = ref<ResizeDir | ''>('');
let resizeStart = { x: 0, y: 0 };
let resizeBase = { x: 0, y: 0, w: 0, h: 0 };
function onResizeStart(e: PointerEvent, dir: ResizeDir) {
  if (e.button !== 0) return;
  if (maximized.value) return;
  e.preventDefault();
  resizeDir.value = dir;
  resizeStart = { x: e.clientX, y: e.clientY };
  resizeBase = { x: panelX.value, y: panelY.value, w: panelW.value, h: panelH.value };
  hostWindow.addEventListener('pointermove', onResizeMove);
  hostWindow.addEventListener('pointerup', onResizeEnd, { once: true });
}
function onResizeMove(e: PointerEvent) {
  if (!resizeDir.value) return;
  const dx = e.clientX - resizeStart.x;
  const dy = e.clientY - resizeStart.y;
  let nx = resizeBase.x, ny = resizeBase.y, nw = resizeBase.w, nh = resizeBase.h;
  const d = resizeDir.value;
  if (d.includes('e')) nw = resizeBase.w + dx;
  if (d.includes('s')) nh = resizeBase.h + dy;
  if (d.includes('w')) { nw = resizeBase.w - dx; nx = resizeBase.x + dx; }
  if (d.includes('n')) { nh = resizeBase.h - dy; ny = resizeBase.y + dy; }
  // 处理最小尺寸时位置不能继续往里走
  const maxW = Math.max(PANEL_MIN_W, winW.value - EDGE_GAP * 2);
  const maxH = Math.max(PANEL_MIN_H, winH.value - EDGE_GAP * 2);
  if (nw < PANEL_MIN_W) {
    if (d.includes('w')) nx = resizeBase.x + (resizeBase.w - PANEL_MIN_W);
    nw = PANEL_MIN_W;
  }
  if (nw > maxW) {
    if (d.includes('w')) nx = resizeBase.x + (resizeBase.w - maxW);
    nw = maxW;
  }
  if (nh < PANEL_MIN_H) {
    if (d.includes('n')) ny = resizeBase.y + (resizeBase.h - PANEL_MIN_H);
    nh = PANEL_MIN_H;
  }
  if (nh > maxH) {
    if (d.includes('n')) ny = resizeBase.y + (resizeBase.h - maxH);
    nh = maxH;
  }
  // 边界 clamp
  nx = clamp(nx, EDGE_GAP, Math.max(EDGE_GAP, winW.value - nw - EDGE_GAP));
  ny = clamp(ny, EDGE_GAP, Math.max(EDGE_GAP, winH.value - nh - EDGE_GAP));
  panelX.value = nx; panelY.value = ny;
  panelW.value = nw; panelH.value = nh;
}
function onResizeEnd() {
  hostWindow.removeEventListener('pointermove', onResizeMove);
  resizeDir.value = '';
  saveState();
}

// ─── 最大化 / 还原 ───
function toggleMaximize() {
  if (!maximized.value) {
    lastNormalRect.value = { x: panelX.value, y: panelY.value, w: panelW.value, h: panelH.value };
    maximized.value = true;
    panelX.value = EDGE_GAP; panelY.value = EDGE_GAP;
    panelW.value = Math.max(PANEL_MIN_W, winW.value - EDGE_GAP * 2);
    panelH.value = Math.max(PANEL_MIN_H, winH.value - EDGE_GAP * 2);
  } else {
    maximized.value = false;
    const r = lastNormalRect.value;
    if (r) {
      panelX.value = r.x; panelY.value = r.y;
      panelW.value = r.w; panelH.value = r.h;
    }
    clampPanelSize(); clampPanelPos();
  }
  saveState();
}

function collapseToBall() {
  panelOpen.value = false;
  saveState();
}

// ─── 外框功能平移到状态栏顶栏 ───
// 顶栏是 innerHTML 注入的静态骨架（非 Vue 模板），所以这里用原生 addEventListener 绑，
// 而不是 @click；注入只发生一次（mountStatusBar 之后），无需解绑重绑。
//   · 空白处 pointerdown → 拖动面板
//   · 「此间天地」click   → 收起为悬浮球
//   · 左皇冠 click        → 全屏 / 还原（stopPropagation，不冒泡触发标题的收起）
function bindTopbarControls() {
  const host = bodyRef.value;
  if (!host) return;
  const topbar = host.querySelector('.th-topbar') as HTMLElement | null;
  if (!topbar) return;
  topbar.addEventListener('pointerdown', onPanelPointerDown as EventListener);
  const title = topbar.querySelector('.th-topbar-title') as HTMLElement | null;
  title?.addEventListener('click', () => { collapseToBall(); });
  const crownL = topbar.querySelector('.th-title-crown-l') as HTMLElement | null;
  crownL?.addEventListener('click', (e: Event) => { e.stopPropagation(); toggleMaximize(); });
  // 皇冠 tooltip 跟随最大化状态（DOM 在 Vue 之外，用 watch 手动同步）
  const syncCrown = () => {
    crownL?.setAttribute('title', maximized.value ? '点击还原窗口' : '点击全屏');
    crownL?.classList.toggle('is-max', maximized.value);
  };
  syncCrown();
  watch(maximized, syncCrown);
}

// 右皇冠折叠正文（状态栏内部行为）→ 面板高度跟着收成"只剩顶栏"。
// 不去改 panelH（那会污染用户拖过的尺寸、还要跟 PANEL_MIN_H 打架），
// 改挂 .folded 让 height:auto 生效，展开时自动回到 panelH。
const panelFolded = ref(false);
function onPanelFold(e: Event) {
  panelFolded.value = !!(e as CustomEvent).detail?.folded;
}

// ─── 状态栏挂载 ───
const panelRef = ref<HTMLElement | null>(null);
const bodyRef = ref<HTMLElement | null>(null);
let statusBarDestroy: (() => void) | null = null;
let statusBarMounted = false;

function extractStatusBarBody(): string {
  const m = statusBarRawHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m ? m[1] : statusBarRawHtml;
}

async function mountStatusBar() {
  if (statusBarMounted) return;
  if (!bodyRef.value) return;
  bodyRef.value.innerHTML = extractStatusBarBody();
  statusBarMounted = true;
  // 先绑外框平移的三件事（拖动/收起/全屏），再跑状态栏自己的初始化：
  // 两边监听器互不覆盖（不同元素 / 不同阶段），顺序只影响首帧 title 文案。
  bindTopbarControls();
  try {
    const { destroy } = await setupStatusBar();
    statusBarDestroy = destroy;
  } catch (e) {
    console.error('[前端悬浮球V1] 状态栏初始化失败:', e);
  }
}

// 视口大小变化
onMounted(async () => {
  hostWindow.addEventListener('resize', syncWinSize);
  syncBallSkin();
  window.addEventListener('th-appearance-change', syncBallSkin);
  window.addEventListener('th:panel-fold', onPanelFold as EventListener);
  clampAll();
  await nextTick();
  // 状态栏一次性挂载（之后通过 v-show 切换显示，DOM 不销毁）
  await mountStatusBar();
  // 订阅变量审核队列变化，实时更新角标
  refreshReviewBadge();
  try { reviewUnsub = subscribeReview(() => refreshReviewBadge()); } catch (e) { void e; }
});

onUnmounted(() => {
  hostWindow.removeEventListener('resize', syncWinSize);
  hostWindow.removeEventListener('pointermove', onBallPointerMove);
  hostWindow.removeEventListener('pointermove', onPanelPointerMove);
  hostWindow.removeEventListener('pointermove', onResizeMove);
  hostWindow.removeEventListener('pointermove', onSnapResizeMove);
  window.removeEventListener('th-appearance-change', syncBallSkin);
  window.removeEventListener('th:panel-fold', onPanelFold as EventListener);
  try { reviewUnsub?.(); } catch(e){ void e; }
  try { statusBarDestroy?.(); } catch(e){ void e; }
});

watch([panelOpen, maximized, ballX, ballY, panelX, panelY, panelW, panelH], saveState);
</script>

<style scoped lang="scss">
/* ─── 悬浮球容器：承载球 + 卫星入口；容器本身不拦截点击，仅内部按钮可交互 ─── */
.th-fab-dock {
  position: fixed;
  z-index: 99999;
  pointer-events: none;
}
.th-fab-dock > * { pointer-events: auto; }

/* 悬浮球（皮肤无关骨架，背景/描边/阴影由 [data-skin] 提供） */
.th-fab-ball {
  position: relative;
  width: 48px; height: 48px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.4);
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  padding: 0;
  transition: box-shadow .18s, transform .14s, background .3s;
}
.th-fab-ball > svg { position: relative; z-index: 2; }
.th-fab-ball:hover { transform: scale(1.06); }

/* 角标：右上角未审核变量条目数 */
.th-fab-badge {
  position: absolute; top: -5px; right: -5px; z-index: 4;
  min-width: 19px; height: 19px; padding: 0 5px;
  border-radius: 10px;
  background: linear-gradient(135deg, #ff5c8a, #ff3d6e);
  color: #fff; font-size: 11px; font-weight: 700; line-height: 19px;
  text-align: center; letter-spacing: .2px;
  border: 1.5px solid #fff;
  box-shadow: 0 2px 6px rgba(255, 60, 110, 0.5);
  pointer-events: none;
}

/* 悬停世界速览卡：世界信息 + 主角 + 在场角色（卡片内部滚动）
   配色改引用 status-bar.css 的现成 token（--pink/--lav/--game-gold/--sh-3/--font-*），
   fallback 值保证 portal 场景下拿不到变量时不塌。 */
.th-fab-snap {
  /* 定位交给 snapStyle（贴球所在一侧 + 视口内夹取 + maxWidth 按对侧实际可用宽）；此处只放尺寸与外观 */
  position: absolute; z-index: 5;
  width: 1080px; max-width: 94vw;
  container-type: inline-size; container-name: th-snap;
  display: flex; flex-direction: column;
  background:
    radial-gradient(ellipse 60% 46% at 8% -6%, rgba(255,226,240,0.5), transparent 64%),
    radial-gradient(ellipse 52% 40% at 98% 4%, rgba(226,240,255,0.42), transparent 62%),
    radial-gradient(ellipse 62% 44% at 88% 104%, rgba(238,226,255,0.4), transparent 64%),
    radial-gradient(ellipse 50% 34% at 4% 96%, rgba(255,242,224,0.34), transparent 64%),
    linear-gradient(168deg, #fffefe 0%, #fffafd 46%, #fff7fb 100%);
  /* 底色是不透明白，所以不需要 backdrop-filter（也顺手避开它带来的层叠上下文副作用） */
  border: 1.5px solid rgba(255,255,255,0.95);
  outline: 1px solid rgba(255, 206, 228, 0.8);
  outline-offset: 0;
  border-radius: 22px;
  box-shadow: 0 22px 54px rgba(255, 178, 210, 0.24), 0 5px 16px rgba(214, 170, 205, 0.12), inset 0 2px 0 rgba(255,255,255,0.98);
  /* 文字色写死不吃外部 token：卡片是固定独立的浅色糖果主题，不跟随皮肤/世界套件换肤 */
  color: #4a3346; overflow: hidden;
}
/* 全局签名细线：粉→薰→蓝，与其余卡片统一 */
.th-fab-snap::before {
  content: ''; position: absolute; left: 0; right: 0; top: 0; height: 2px;
  background: linear-gradient(90deg, transparent, #ff9ebc 18%, #d3a8ff 50%, #8fdcf2 82%, transparent);
  z-index: 3; pointer-events: none;
}
.th-fab-snap.pinned { outline-color: #ffa8c6; outline-width: 2px; }
/* 缩放中：关掉过渡+文字选中，描边点亮，跟面板 .resizing 一个观感 */
.th-fab-snap.resizing { outline-color: #ff8fb2; outline-width: 2px; user-select: none; }
.th-fab-snap.resizing * { transition: none !important; }
/* 四角缩放手柄：常态透明，hover/缩放时浮出两条角线（不做四边——右边缘会压住卡内滚动条） */
.th-fab-snap-rz {
  position: absolute; z-index: 6; width: 18px; height: 18px;
  touch-action: none;
}
.th-fab-snap-rz::after {
  content: ''; position: absolute; inset: 4px;
  border-color: #ff9ebc; border-style: solid; border-width: 0;
  opacity: 0; transition: opacity .16s var(--ease-smooth, ease);
}
.th-fab-snap:hover .th-fab-snap-rz::after { opacity: .55; }
.th-fab-snap-rz:hover::after, .th-fab-snap.resizing .th-fab-snap-rz::after { opacity: 1; }
.th-fab-snap-rz.nw { top: 0; left: 0; cursor: nwse-resize; }
.th-fab-snap-rz.nw::after { border-top-width: 2px; border-left-width: 2px; border-radius: 7px 0 0 0; }
.th-fab-snap-rz.ne { top: 0; right: 0; cursor: nesw-resize; }
.th-fab-snap-rz.ne::after { border-top-width: 2px; border-right-width: 2px; border-radius: 0 7px 0 0; }
.th-fab-snap-rz.sw { bottom: 0; left: 0; cursor: nesw-resize; }
.th-fab-snap-rz.sw::after { border-bottom-width: 2px; border-left-width: 2px; border-radius: 0 0 0 7px; }
.th-fab-snap-rz.se { bottom: 0; right: 0; cursor: nwse-resize; }
.th-fab-snap-rz.se::after { border-bottom-width: 2px; border-right-width: 2px; border-radius: 0 0 7px 0; }
/* 表头：单行（标题 + 世界胶囊 + 按钮），糖果粉亮底 */
.th-fab-snap-head {
  position: relative; flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 9px 14px; border-bottom: 1px solid rgba(255, 214, 234, 0.6);
  background: linear-gradient(120deg, rgba(255, 238, 246, 0.7), rgba(255, 247, 251, 0.5) 52%, rgba(242, 247, 255, 0.55));
}
/* 昼夜氛围：按世界「时间」给表头一层甜色（全部走明亮系，夜也是淡紫蓝而非深色） */
.th-fab-snap-head::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .4s var(--ease-smooth, ease);
}
.th-fab-snap.dp-dawn  .th-fab-snap-head::after { opacity: 1; background: linear-gradient(120deg, rgba(255,238,212,0.42), rgba(255,230,240,0.18) 60%, transparent); }
.th-fab-snap.dp-day   .th-fab-snap-head::after { opacity: 1; background: linear-gradient(120deg, rgba(224,242,255,0.4), rgba(240,250,255,0.16) 60%, transparent); }
.th-fab-snap.dp-dusk  .th-fab-snap-head::after { opacity: 1; background: linear-gradient(120deg, rgba(255,224,216,0.4), rgba(244,224,255,0.2) 62%, transparent); }
.th-fab-snap.dp-night .th-fab-snap-head::after { opacity: 1; background: linear-gradient(120deg, rgba(230,230,255,0.4), rgba(242,234,255,0.18) 60%, transparent); }
/* 世界信息胶囊（带语义图标）：标题去掉后表头整行都归它，横向铺满 */
.th-fab-snap-wchips { position: relative; z-index: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 5px 6px; min-width: 0; }
.th-fab-snap-wchip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 13px; font-weight: 600; color: #6f4f66;
  background: rgba(255, 255, 255, 0.9); border: 1px solid rgba(255, 214, 234, 0.95);
  border-radius: 999px; padding: 3px 11px; letter-spacing: 0;
  box-shadow: 0 1px 4px rgba(255, 190, 218, 0.18);
}
.th-fab-snap-wchip svg { color: #ff9eb8; flex: none; }
.th-fab-snap-wchip b { font-weight: 700; color: #e8749f; font-size: 12px; }
/* 无世界信息时按钮仍靠右（表头没有标题占位了） */
.th-fab-snap-acts { position: relative; z-index: 1; display: inline-flex; gap: 5px; flex: none; margin-left: auto; }
.th-fab-snap-act { display: inline-flex; align-items: center; justify-content: center; width: 25px; height: 25px; border: 1px solid rgba(255, 214, 234, 0.95); border-radius: 9px; background: rgba(255, 255, 255, 0.92); color: #ff8fb2; cursor: pointer; box-shadow: 0 1px 4px rgba(255, 190, 218, 0.2); transition: background .15s, transform .1s, border-color .15s; }
.th-fab-snap-act:hover { background: linear-gradient(135deg, #ffe6f0, #ffd4e6); color: #f0709b; }
.th-fab-snap-act:active { transform: scale(0.9); }
.th-fab-snap-act:focus-visible { outline: none; box-shadow: var(--focus-ring, 0 0 0 3px rgba(255,123,157,0.35)); }
.th-fab-snap-act.on { background: linear-gradient(135deg, #ffc2d8, #ff9ebd); color: #fff; border-color: rgba(255,255,255,0.8); }
/* 滚动区：双栏栅格（左主角档案定宽 / 右在场角色吃满剩余），顶/底渐隐遮罩 */
.th-fab-snap-body {
  flex: 1; min-height: 0; overflow-y: auto; padding: 12px 14px 14px;
  display: flex; flex-direction: column; gap: 12px;
  mask-image: linear-gradient(180deg, transparent 0, #000 12px, #000 calc(100% - 14px), transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 12px, #000 calc(100% - 14px), transparent 100%);
  scrollbar-width: thin;
}
/* 卡被视口/球位夹窄时：田字格退单列、主角下半退两格，避免长文被挤成面条 */
@container th-snap (max-width: 880px) {
  .th-fab-snap-npc-body { grid-template-columns: minmax(0, 1fr); }
  .th-fab-snap-attrs { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@container th-snap (max-width: 620px) {
  .th-fab-snap-npc-head { flex-wrap: wrap; }
  .th-fab-snap-ava-npc { width: 168px; height: 224px; font-size: 56px; }
  .th-fab-snap-npc-left { width: 168px; }
  .th-fab-snap-ubody { grid-template-columns: minmax(0, 1fr); }
  .th-fab-snap-attrs { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  /* 太窄时五值一排会挤到 <60px：退成 2 排 3/2 列 */
  .th-fab-snap-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
.th-fab-snap-body::-webkit-scrollbar { width: 8px; }
.th-fab-snap-body::-webkit-scrollbar-thumb { background: rgba(255, 190, 216, 0.28); border-radius: 4px; border: 2px solid transparent; background-clip: padding-box; transition: background .2s; }
.th-fab-snap-body:hover::-webkit-scrollbar-thumb { background: rgba(255, 168, 202, 0.7); background-clip: padding-box; }
.th-fab-snap.pinned .th-fab-snap-body { user-select: text; }
.th-fab-snap-empty { font-size: 14px; color: #8b6d8e; line-height: 1.7; padding: 10px 2px; font-family: var(--font-body, inherit); }
/* 左栏：主角档案（小头像 + 右侧名字/短字段，纵向省一大截） */
.th-fab-snap-col-u { min-width: 0; }
.th-fab-snap-ucard {
  display: flex; flex-direction: column; gap: 10px;
  padding: 11px; border-radius: 16px;
  background:
    radial-gradient(ellipse 120% 60% at 20% 0%, rgba(255, 234, 244, 0.9), transparent 64%),
    radial-gradient(ellipse 110% 60% at 100% 100%, rgba(234, 240, 255, 0.75), transparent 62%),
    rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.98);
  box-shadow: 0 5px 16px rgba(255, 196, 222, 0.2), inset 0 1px 0 rgba(255,255,255,0.98);
}
/* 主角头部：立绘 + 右侧（名字行 + 属性），通栏后右侧很宽所以能一行装完 */
.th-fab-snap-uhead { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.th-fab-snap-uside { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
/* 名字 + 位置 + 金钱/背包/技能同一行（通栏后不再各占一行） */
.th-fab-snap-urow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }
.th-fab-snap-urow .th-fab-snap-ubag { margin-left: auto; }
.th-fab-snap-uname {
  display: inline-flex; align-items: baseline; gap: 5px; flex-wrap: wrap;
  font-family: var(--font-heading, inherit); font-size: 17px; font-weight: 800; letter-spacing: .6px;
  color: #e07fa4;
}
.th-fab-snap-uname em { font-style: normal; font-weight: 700; font-size: 11px; color: #fff; background: linear-gradient(135deg, #ffc0d6, #ff9dbc); border-radius: 6px; padding: 1px 6px; letter-spacing: .4px; }
/* 主角下半：长文两格 + 状态 + 穿着，通栏一排四格（等高对齐，不再纵向堆四段） */
/* 主角长文：通栏两列（姿态动作 / 身体状态），不用 auto-fit 免得少一段时被拉成一条 */
.th-fab-snap-ubody { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 9px 12px; min-width: 0; }
.th-fab-snap-ubody > .th-fab-snap-field:last-child:nth-child(odd) { grid-column: 1 / -1; }
/* 状态 / 穿着并排：穿着条目多，给它双倍权重，两组各自内部再多列铺 */
.th-fab-snap-urow2,
.th-fab-snap-npc-cards { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px 12px; min-width: 0; }
.th-fab-snap-urow2 > .th-fab-snap-grp,
.th-fab-snap-npc-cards > .th-fab-snap-grp { flex: 1 1 200px; min-width: 0; }
.th-fab-snap-urow2 > .th-fab-snap-grp-cl,
.th-fab-snap-npc-cards > .th-fab-snap-grp-cl { flex: 2.2 1 340px; }
/* 头像右侧余白：金钱 + 背包/技能（明细走 hover 浮窗，卡内不占高度） */
.th-fab-snap-ubag { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 6px; }
.th-fab-snap-money {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12.5px; font-weight: 800; font-variant-numeric: tabular-nums; color: #c78a3e;
  background: linear-gradient(135deg, rgba(255, 248, 232, 0.98), rgba(255, 242, 216, 0.92));
  border: 1px solid rgba(246, 222, 168, 0.95); border-radius: 999px; padding: 3px 10px;
  box-shadow: 0 1px 4px rgba(232, 196, 130, 0.2);
}
.th-fab-snap-money svg { color: #eab764; flex: none; }
.th-fab-snap-mini {
  display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
  font-family: var(--font-label, inherit); font-size: 12.5px; font-weight: 700; color: #8f6fc4;
  background: linear-gradient(135deg, rgba(246, 240, 255, 0.98), rgba(238, 244, 255, 0.92));
  border: 1px solid rgba(224, 210, 250, 0.95); border-radius: 999px; padding: 3px 10px;
  box-shadow: 0 1px 4px rgba(200, 186, 240, 0.18); transition: background .15s, transform .12s, color .15s;
}
.th-fab-snap-mini svg { color: #a583d8; flex: none; }
.th-fab-snap-mini i { font-style: normal; font-weight: 800; font-variant-numeric: tabular-nums; color: #7a58b4; }
.th-fab-snap-mini:hover { background: linear-gradient(135deg, #f0e6ff, #e6ecff); color: #7a58b4; transform: translateY(-1px); }
.th-fab-snap-mini:focus-visible { outline: none; box-shadow: var(--focus-ring, 0 0 0 3px rgba(255,123,157,0.35)); }
/* 立绘铭牌：压在 NPC 立绘底部的奶白磨砂条（浅色系，不用饱和粉盖住立绘） */
.th-fab-snap-plate {
  position: absolute; left: 5px; right: 5px; bottom: 5px; z-index: 1;
  display: flex; align-items: baseline; gap: 5px; justify-content: center;
  padding: 4px 8px; border-radius: 10px;
  font-family: var(--font-heading, inherit); font-size: 15px; font-weight: 800; line-height: 1.3;
  color: #d1547f; letter-spacing: .4px;
  background: rgba(255, 252, 253, 0.88);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 2px 8px rgba(190, 130, 165, 0.22);
  pointer-events: none;
}
/* 模块小标题：糖果色渐变短条 + 字，让每个模块有自己的“抬头” */
.th-fab-snap-grp { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.th-fab-snap-grp-t {
  display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
  font-family: var(--font-label, inherit); font-size: 12px; font-weight: 800; letter-spacing: 1px;
  color: #e284a8;
}
.th-fab-snap-grp-t::before { content: ''; width: 12px; height: 3px; border-radius: 3px; background: linear-gradient(90deg, #ffa8c6, #d9b4ff); }
.th-fab-snap-grp-t::after { content: ''; flex: 1; }
/* 头部短字段行 */
.th-fab-snap-hls { display: flex; flex-wrap: wrap; gap: 5px 6px; }
/* 右栏：在场角色 */
.th-fab-snap-col-n { min-width: 0; display: flex; flex-direction: column; gap: 10px; }
/* 区块标题：糖果渐变细线，亮系不压暗 */
.th-fab-snap-sec-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-bottom: 5px; border-bottom: 1.5px solid transparent; border-image: linear-gradient(90deg, #ffb6d0, #e2c6ff 45%, rgba(206, 228, 255, 0.5) 75%, transparent) 1; }
.th-fab-snap-sec-t { display: inline-flex; align-items: center; gap: 7px; font-family: var(--font-heading, inherit); font-size: 14.5px; font-weight: 800; color: #e884aa; letter-spacing: 1px; }
.th-fab-snap-sec-h em { font-style: normal; font-weight: 800; font-size: 11.5px; color: #fff; background: linear-gradient(135deg, #ffc0d8, #ff9dbd); padding: 1px 8px; border-radius: 999px; box-shadow: 0 1px 4px rgba(255,158,190,0.3); }
/* 在场角色导航条：小圆头像，点击滚到对应卡 */
.th-fab-snap-nav { display: inline-flex; gap: 4px; flex: none; }
.th-fab-snap-navdot { width: 24px; height: 24px; padding: 0; border-radius: 50%; overflow: hidden; border: 1.5px solid rgba(255,255,255,0.9); background: var(--ava-c, #ff9eb8); color: #fff; font-size: 11px; font-weight: 800; cursor: pointer; box-shadow: 0 1px 4px rgba(200,150,180,0.25); transition: transform .16s var(--ease-bounce, ease), box-shadow .16s; }
.th-fab-snap-navdot img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 18%; display: block; }
.th-fab-snap-navdot:hover { transform: translateY(-2px) scale(1.12); box-shadow: 0 4px 10px rgba(200,67,122,0.4); }
.th-fab-snap-navdot:focus-visible { outline: none; box-shadow: var(--focus-ring, 0 0 0 3px rgba(255,123,157,0.35)); }
.th-fab-snap-field { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; line-height: 1.6; }
.th-fab-snap-flabel { flex: 0 0 64px; font-weight: 800; color: #e284a8; font-family: var(--font-label, inherit); letter-spacing: .6px; }
/* 长文本（身体状态/本能渴望/姿态动作 40~50+ 字）：小标题在上、正文整宽在下 */
.th-fab-snap-field-long { flex-direction: column; gap: 3px; padding: 7px 11px; border-radius: 12px; background: linear-gradient(150deg, rgba(255,255,255,0.95), rgba(255,250,253,0.8)); border: 1px solid rgba(255, 226, 240, 0.95); box-shadow: 0 2px 7px rgba(255, 196, 222, 0.14); }
.th-fab-snap-field-long .th-fab-snap-flabel { flex: none; font-size: 11.5px; letter-spacing: 1px; color: #e284a8; }
.th-fab-snap-field-long .th-fab-snap-fval { font-family: var(--font-body, inherit); font-size: 14px; line-height: 1.75; }
/* 内心想法：第一人称心声 → 引文样式（薰衣草色，与粉系长文本区分） */
.th-fab-snap-field-quote { flex-direction: column; gap: 3px; padding: 7px 12px; border-left: 3px solid #d9b4ff; border-radius: 0 12px 12px 0; background: linear-gradient(100deg, rgba(249, 243, 255, 0.92), rgba(255, 250, 254, 0.6)); }
.th-fab-snap-field-quote .th-fab-snap-flabel { flex: none; font-size: 11.5px; letter-spacing: 1px; color: #ac7ee0; }
.th-fab-snap-field-quote .th-fab-snap-fval { font-family: var(--font-body, inherit); font-size: 14px; line-height: 1.75; font-style: italic; color: #6d5382; }
.th-fab-snap-field-quote .th-fab-snap-fval::before { content: '「'; color: #c69cf0; }
.th-fab-snap-field-quote .th-fab-snap-fval::after { content: '」'; color: #c69cf0; }
/* 零截断：值区完整换行平铺，不省略 */
.th-fab-snap-fval { flex: 1; min-width: 0; color: #5c4455; word-break: break-word; white-space: pre-wrap; }

/* 头像（主角/NPC 共用底样式，尺寸各自覆盖） */
/* 立绘框：白高光内描边 + 粉雾外描边（不用金色，避免整卡发暗），顶部对齐保住脸 */
.th-fab-snap-ava {
  position: relative; flex: none; border-radius: 16px; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 800; cursor: pointer;
  background: var(--ava-c, #ff9eb8);
  border: 2px solid rgba(255,255,255,0.98);
  outline: 1.5px solid rgba(255, 206, 228, 0.9);
  box-shadow: 0 4px 14px rgba(255, 190, 216, 0.28), inset 0 1px 0 rgba(255,255,255,0.6);
  transition: transform .22s var(--ease-bounce, ease), box-shadow .22s, outline-color .22s;
}
.th-fab-snap-ava:hover { transform: translateY(-2px) scale(1.02); outline-color: #ffa8c6; box-shadow: 0 9px 22px rgba(255, 168, 202, 0.36), inset 0 1px 0 rgba(255,255,255,0.7); }
/* object-position 顶部偏上：cover 裁切时优先保住人物脸部 */
.th-fab-snap-ava img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 15%; display: block; }
/* 无头像占位：渐变 + 细斜纹，比纯色底有质感 */
.th-fab-snap-ava.ph {
  background:
    repeating-linear-gradient(135deg, rgba(255,255,255,0.2) 0 7px, transparent 7px 14px),
    radial-gradient(120% 120% at 30% 22%, rgba(255,255,255,0.55), transparent 58%),
    var(--ava-c, #ff9eb8);
  text-shadow: 0 2px 8px rgba(150,60,105,0.3);
}
/* 立绘尺寸：主角缩成小竖幅（左栏让位给数据），NPC 是视觉主体所以放大 */
.th-fab-snap-ava-user { width: 104px; height: 132px; font-size: 40px; border-radius: 14px; }
.th-fab-snap-ava-npc { width: 250px; height: 334px; font-size: 84px; border-radius: 18px; }
/* 有图才可点大图：放大镜光标；NPC 无图仍可点去详情设头像，主角无图无动作 */
.th-fab-snap-ava.zoom { cursor: zoom-in; }
.th-fab-snap-ava-user.ph { cursor: default; }
.th-fab-snap-ava-user.ph:hover { transform: none; }

/* 头部短字段（身份/生日/位置）：糖果小胶囊 */
.th-fab-snap-hl { display: inline-flex; align-items: baseline; gap: 5px; font-size: 12.5px; line-height: 1.5; color: #6f4f66; background: rgba(255, 255, 255, 0.92); border: 1px solid rgba(255, 226, 240, 0.95); border-radius: 999px; padding: 2px 9px; box-shadow: 0 1px 3px rgba(255, 196, 222, 0.14); }
.th-fab-snap-hl b { font-weight: 800; color: #e8749f; font-size: 11.5px; letter-spacing: .4px; }

/* 属性药丸（主角）：名+值，非零才出，值最大 300 */
/* 属性胶囊 = 进度条：--ac 主色在 --p 处硬停（上限 ATTR_MAX，pct 由数据层给）；
   数据层已按值降序，前三 .top 加冕描边。 */
/* 属性：两列等宽栅格，名左值右，底色即进度（窄栏也不参差） */
/* 修行属性：立绘右侧宽 ~900px，六列铺开 11 条 = 2 行（原来 4 列要 3 行） */
.th-fab-snap-attrs { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px 6px; }
.th-fab-snap-attr {
  --ac: #a855f7;
  display: flex; align-items: baseline; justify-content: space-between; gap: 6px;
  font-size: 12.5px; line-height: 1.5; padding: 3px 10px; border-radius: 999px;
  color: #57404f; font-family: var(--font-label, inherit); min-width: 0;
  /* 老内核无 color-mix 时降级为白底描边胶囊（可读性不受影响） */
  background: rgba(255,255,255,0.9);
  border: 1px solid rgba(255, 226, 240, 0.95);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--ac) 26%, #ffffff) 0 var(--p, 0%), rgba(255,255,255,0.92) var(--p, 0%) 100%);
  border: 1px solid color-mix(in srgb, var(--ac) 16%, #ffffff);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
}
.th-fab-snap-attr b { font-weight: 700; }
.th-fab-snap-attr i { font-style: normal; font-weight: 800; font-variant-numeric: tabular-nums; color: #4d3648; }
/* 前三加冕：糖果金细描边 + 皇冠点 */
.th-fab-snap-attr.top { border-color: rgba(255, 216, 164, 0.98); box-shadow: 0 0 0 1px rgba(255, 226, 180, 0.5), inset 0 1px 0 rgba(255,255,255,0.85); }
.th-fab-snap-attr.top b::before { content: '♦'; font-size: 9px; color: #f4c072; margin-right: 3px; vertical-align: 1px; }
.th-fab-snap-attr.attr-type-power { --ac: #ff5080; }
.th-fab-snap-attr.attr-type-charm { --ac: #d946ef; }
.th-fab-snap-attr.attr-type-wisdom { --ac: #3b82f6; }
.th-fab-snap-attr.attr-type-focus { --ac: #8b5cf6; }
.th-fab-snap-attr.attr-type-knowledge { --ac: #06b6d4; }
.th-fab-snap-attr.attr-type-social { --ac: #f59e0b; }
.th-fab-snap-attr.attr-type-art { --ac: #10b981; }
.th-fab-snap-attr.attr-type-business { --ac: #f97316; }
.th-fab-snap-attr.attr-type-craft { --ac: #ec4899; }
.th-fab-snap-attr.attr-type-housework { --ac: #14b8a6; }

/* NPC 卡：左侧 n.color 身份色线（多人在场一眼区分）+ 五值合成的外缘氛围光 */
.th-fab-snap-npc-list { display: flex; flex-direction: column; gap: 12px; }
.th-fab-snap-npc {
  position: relative; display: flex; flex-direction: column; gap: 10px;
  padding: 12px 13px 12px 16px; border-radius: 16px;
  background:
    radial-gradient(ellipse 90% 70% at 100% 0%, rgba(242, 244, 255, 0.7), transparent 62%),
    linear-gradient(155deg, rgba(255, 255, 255, 0.96), rgba(255, 249, 252, 0.85));
  border: 1px solid rgba(255, 255, 255, 0.98);
  box-shadow: 0 4px 14px rgba(255, 196, 222, 0.18), 0 0 0 1px var(--aura, transparent), 0 6px 20px var(--aura, transparent), inset 0 1px 0 rgba(255,255,255,0.95);
  transition: box-shadow .3s var(--ease-smooth, ease), transform .2s var(--ease-smooth, ease);
}
.th-fab-snap-npc:hover { transform: translateY(-1px); box-shadow: 0 9px 24px rgba(255, 180, 210, 0.24), 0 0 0 1px var(--aura, transparent), 0 10px 28px var(--aura, transparent), inset 0 1px 0 rgba(255,255,255,0.95); }
.th-fab-snap-npc::before { content: ''; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px; border-radius: 0 3px 3px 0; background: var(--ava-c, #ff9eb8); opacity: .55; }
.th-fab-snap-npc-head { display: flex; align-items: flex-start; gap: 13px; }
/* 左列宽度 = 立绘宽度，且高度就是立绘高度（小卡都挪到右侧宽区，别再撑长左列） */
.th-fab-snap-npc-left { flex: none; width: 250px; display: flex; flex-direction: column; gap: 8px; }
.th-fab-snap-npc-head-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
/* NPC 下半：四段长文田字格 2×2（本能渴望/姿态动作 上排，内心想法/身体状态 下排） */
.th-fab-snap-npc-body { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 9px 12px; }
/* 奇数段时最后一段占满整行，不留半格空洞 */
.th-fab-snap-npc-body > .th-fab-snap-field:last-child:nth-child(odd) { grid-column: 1 / -1; }
/* 画廊入口：立绘右上角悬浮按钮（浅奶白磨砂；0 张也可点，进弹窗添加） */
.th-fab-snap-gallery { position: absolute; right: 6px; top: 6px; z-index: 2; display: inline-flex; align-items: center; gap: 3px; border: 1px solid rgba(255,255,255,0.98); cursor: pointer; padding: 3px 8px; border-radius: 999px; background: rgba(255, 252, 253, 0.9); color: #ef7fa8; box-shadow: 0 2px 8px rgba(190, 130, 165, 0.22); transition: background .15s, transform .1s, color .15s; }
.th-fab-snap-gallery:hover { background: linear-gradient(135deg, #ffe0ec, #ffcfe1); color: #e2648f; transform: translateY(-1px); }
.th-fab-snap-gallery:active { transform: scale(0.92); }
.th-fab-snap-gallery.empty { color: #cba8bc; }
.th-fab-snap-gallery:focus-visible { outline: none; box-shadow: var(--focus-ring, 0 0 0 3px rgba(255,123,157,0.35)); }
.th-fab-snap-gallery-cnt { font-size: 11.5px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.th-fab-snap-npc-top { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 7px; }
/* 详情按钮：小号糖果描边按钮（名字已在铭牌上） */
.th-fab-snap-npc-name { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; font-family: var(--font-label, inherit); font-size: 12px; font-weight: 800; letter-spacing: 1px; color: #fff; padding: 3px 11px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.98); background: linear-gradient(135deg, #dcbcff, #ffb2cc); box-shadow: 0 2px 7px rgba(215, 170, 225, 0.28); transition: filter .15s, transform .15s; }
.th-fab-snap-npc-name:hover { filter: brightness(1.04) saturate(1.15); transform: translateY(-1px); }
.th-fab-snap-npc-name:focus-visible { outline: none; box-shadow: var(--focus-ring, 0 0 0 3px rgba(255,123,157,0.35)); }
.th-fab-snap-npc-name svg { color: #fff; }

/* 心情浮帖：多标签紧凑排布 */
.th-fab-snap-moods { display: flex; flex-wrap: wrap; gap: 4px; }
.th-fab-snap-mood { font-size: 12.5px; font-weight: 700; color: #e2648f; background: linear-gradient(135deg, rgba(255, 232, 242, 0.95), rgba(255, 220, 234, 0.9)); border: 1px solid rgba(255, 206, 228, 0.95); border-radius: 999px; padding: 2px 10px; box-shadow: 0 1px 4px rgba(255, 196, 222, 0.2); }

/* 情感值：标签 + 细轨条 + 数值三段栅格；五个一排（占位收窄，不再一条占半行） */
/* 五个值定死五列（每格最小 ~72px：30 标签 + 22 数值 + 轨条），不靠 auto-fit 赌换行 */
.th-fab-snap-metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px 8px; }
.th-fab-snap-metric {
  --mc: #f090b0;
  display: grid; grid-template-columns: 32px minmax(20px, 1fr) 24px; align-items: center; gap: 4px;
  font-size: 12px; line-height: 1.4; color: #6f4f66; font-family: var(--font-label, inherit); min-width: 0;
}
.th-fab-snap-metric b { font-weight: 800; color: var(--mc); letter-spacing: .2px; }
.th-fab-snap-metric s {
  text-decoration: none; height: 7px; border-radius: 999px; min-width: 0;
  background: rgba(255, 232, 242, 0.9);
  box-shadow: inset 0 1px 2px rgba(220, 170, 198, 0.16);
  background-image: linear-gradient(90deg, var(--mc) 0 var(--p, 0%), transparent var(--p, 0%) 100%);
  background-repeat: no-repeat;
  transition: background-image .45s var(--ease-smooth, ease);
}
.th-fab-snap-metric i { font-style: normal; font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; color: var(--mc); }
/* ≥80：数值加一层柔光，甜度爆表一眼看到 */
.th-fab-snap-metric.hi i { text-shadow: 0 0 7px color-mix(in srgb, var(--mc) 50%, transparent); }
.th-fab-snap-metric.hi s { box-shadow: inset 0 1px 2px rgba(220, 170, 198, 0.16), 0 0 7px color-mix(in srgb, var(--mc) 40%, transparent); }
.th-fab-snap-metric.heart { --mc: #ff8fae; }
.th-fab-snap-metric.lust { --mc: #f584ac; }
.th-fab-snap-metric.excite { --mc: #f5ac74; }
.th-fab-snap-metric.sense { --mc: #c396ea; }
.th-fab-snap-metric.shame { --mc: #93aaef; }
/* 亲密记录：贴在头部行尾的小徽记，不混作第 6、7 个情感值 */
.th-fab-snap-cnt { display: inline-flex; align-items: baseline; gap: 5px; font-size: 12px; line-height: 1.5; padding: 3px 10px; border-radius: 999px; color: #8f6fc4; background: linear-gradient(135deg, rgba(243, 236, 255, 0.95), rgba(234, 240, 255, 0.9)); border: 1px solid rgba(222, 208, 250, 0.95); font-family: var(--font-label, inherit); box-shadow: 0 1px 4px rgba(200, 186, 240, 0.2); }
.th-fab-snap-cnt b { font-weight: 700; opacity: .85; font-size: 11px; }
.th-fab-snap-cnt i { font-style: normal; font-weight: 800; font-variant-numeric: tabular-nums; }

/* 状态/衣物卡片：零截断，完整平铺换行 */
/* 状态/衣物「双层小卡」：第一行名称加粗（+ 时长 / 破损三格），第二行元信息小字。
   左侧 3px 色条 + 柔阴影，比原来的一行胶囊有质感；零截断，长文完整换行。 */
.th-fab-snap-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(158px, 1fr)); gap: 6px; min-width: 0; }
.th-fab-snap-card {
  --cc: #a583d8;
  position: relative; display: flex; flex-direction: column; gap: 2px; min-width: 0;
  padding: 5px 10px 5px 12px; border-radius: 11px;
  font-size: 12.5px; line-height: 1.5;
  background: linear-gradient(140deg, rgba(255,255,255,0.97), rgba(252,250,255,0.86));
  border: 1px solid rgba(255,255,255,0.98);
  box-shadow: 0 2px 8px rgba(214, 190, 226, 0.2), inset 0 1px 0 rgba(255,255,255,0.95);
  transition: box-shadow .18s var(--ease-smooth, ease), transform .16s var(--ease-smooth, ease);
}
/* 左侧色条：状态紫 / 衣物青 / 破损档换色，一眼分类 */
.th-fab-snap-card::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 0 3px 3px 0; background: var(--cc); opacity: .9; }
.th-fab-snap-card:hover { transform: translateY(-1px); box-shadow: 0 5px 14px rgba(214, 178, 226, 0.28), inset 0 1px 0 rgba(255,255,255,0.95); }
.th-fab-snap-card-r1 { display: flex; align-items: center; gap: 6px; min-width: 0; }
.th-fab-snap-card-r1 b { font-weight: 800; font-size: 13px; color: var(--cc); letter-spacing: .3px; word-break: break-word; }
/* 时长/破损靠右，第一行右端不空着 */
.th-fab-snap-card-r1 em { font-style: normal; margin-left: auto; flex: none; font-size: 11.5px; font-weight: 700; color: var(--cc); opacity: .85; background: rgba(255,255,255,0.75); border-radius: 999px; padding: 0 7px; }
.th-fab-snap-card-r2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 7px; min-width: 0; color: #6b5266; }
.th-fab-snap-card-r2 i { font-style: normal; font-size: 12px; opacity: .9; word-break: break-word; }
/* 来源：前缀点，与效果文案区分开 */
.th-fab-snap-card-r2 u { text-decoration: none; font-size: 11.5px; opacity: .72; }
.th-fab-snap-card-r2 u::before { content: '·'; margin-right: 4px; opacity: .6; }
.th-fab-snap-card-r2 em { font-style: normal; font-size: 11.5px; font-weight: 700; color: var(--cc); opacity: .9; }
.th-fab-snap-card-st { --cc: #a583d8; }

/* ─── 衣物小卡（重做）───────────────────────────────────────────
   三行结构：① 衣架图标 + 名称 + 部位标签 ② 穿着胶囊 + 破损（三格 pip + 档名）③ 衣物状态一行。
   破损四档各有自己的主色（--cc 驱动色条/名称/pip/胶囊），完好也算一档不再和"未知"共用中性色。
   衣物组的网格比状态组宽一点：三行内容 + 部位标签，158px 会挤。 */
.th-fab-snap-grp-cl .th-fab-snap-cards { grid-template-columns: repeat(auto-fill, minmax(184px, 1fr)); }
.th-fab-snap-card-cl {
  --cc: #4fa88a; --cbg: rgba(242, 253, 248, 0.82);
  gap: 4px; padding: 7px 10px 7px 13px;
  background: linear-gradient(140deg, rgba(255,255,255,0.97), var(--cbg));
}
.th-fab-snap-card-cl::before { top: 7px; bottom: 7px; width: 3.5px; opacity: 1; }
/* ① 名称行：图标 + 名称 + 部位靠右 */
.th-fab-snap-cl-r1 { display: flex; align-items: center; gap: 5px; min-width: 0; }
.th-fab-snap-cl-ico { flex: none; color: var(--cc); opacity: .85; }
.th-fab-snap-cl-r1 b {
  font-weight: 800; font-size: 12.5px; letter-spacing: .3px; color: #4a3a48;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.th-fab-snap-cl-part {
  margin-left: auto; flex: none; font-size: 10.5px; font-weight: 700; line-height: 1.6;
  padding: 0 6px; border-radius: 999px; color: #7c6a86;
  background: rgba(255,255,255,0.82); border: 1px solid rgba(226, 216, 232, 0.9);
}
/* ② 穿着 + 破损：两块并排，中间不留空 */
.th-fab-snap-cl-r2 { display: flex; align-items: center; gap: 5px; min-width: 0; }
.th-fab-snap-cl-wear {
  flex: none; font-size: 10.5px; font-weight: 700; line-height: 1.7;
  padding: 0 7px; border-radius: 999px; color: #5f8fbe;
  background: rgba(233, 244, 255, 0.9); border: 1px solid rgba(198, 223, 247, 0.95);
}
.th-fab-snap-cl-dmg {
  display: inline-flex; align-items: center; gap: 5px; margin-left: auto; flex: none;
  font-size: 10.5px; font-weight: 800; line-height: 1.7; letter-spacing: .2px;
  padding: 0 7px 0 6px; border-radius: 999px;
  color: var(--cc);
  background: linear-gradient(135deg, rgba(255,255,255,0.95), color-mix(in srgb, var(--cc) 10%, rgba(255,255,255,0.9)));
  border: 1px solid color-mix(in srgb, var(--cc) 34%, rgba(255,255,255,0.9));
  box-shadow: 0 1px 3px color-mix(in srgb, var(--cc) 16%, transparent);
}
/* 破损三格 pip：完好=空三格，轻微/中度/严重依次点亮（点亮档带同色柔光） */
.th-fab-snap-pips { text-decoration: none; display: inline-flex; gap: 2.5px; flex: none; }
.th-fab-snap-pips i {
  width: 8px; height: 4.5px; border-radius: 2.5px;
  background: color-mix(in srgb, var(--cc) 15%, transparent);
  transition: background .2s var(--ease-smooth, ease), box-shadow .2s var(--ease-smooth, ease);
}
/* ③ 衣物状态：整行浅底小字 + 前缀点，长文换行不截断 */
.th-fab-snap-cl-state {
  display: flex; align-items: baseline; gap: 5px; min-width: 0;
  font-size: 11px; line-height: 1.55; color: #6b5266;
  padding: 2.5px 8px 2.5px 7px; border-radius: 8px;
  background: linear-gradient(120deg, rgba(255,255,255,0.86), color-mix(in srgb, var(--cc) 7%, rgba(255,255,255,0.7)));
  border-left: 2.5px solid color-mix(in srgb, var(--cc) 48%, transparent);
}
.th-fab-snap-cl-state::before {
  content: ''; flex: none; width: 4px; height: 4px; border-radius: 50%;
  background: var(--cc); opacity: .75; transform: translateY(-1px);
}
.th-fab-snap-cl-state em { font-style: normal; min-width: 0; word-break: break-word; }
/* 卡片 hover：色条拉长 + 同色描边，提示"这张卡可以悬停看外观详情" */
.th-fab-snap-card-cl:hover {
  border-color: color-mix(in srgb, var(--cc) 30%, rgba(255,255,255,0.98));
  box-shadow: 0 5px 14px color-mix(in srgb, var(--cc) 22%, transparent), inset 0 1px 0 rgba(255,255,255,0.95);
}
.th-fab-snap-card-cl:hover::before { top: 4px; bottom: 4px; }
.th-fab-snap-card-cl::before { transition: top .16s var(--ease-smooth, ease), bottom .16s var(--ease-smooth, ease); }
/* 破损四色阶：完好(绿) → 轻微(金) → 中度(橙) → 严重(红) */
.th-fab-snap-card-cl.dmg0 { --cc: #4fa88a; --cbg: rgba(242, 253, 248, 0.82); }
.th-fab-snap-card-cl.dmg1 { --cc: #c19226; --cbg: rgba(255, 251, 236, 0.9); }
.th-fab-snap-card-cl.dmg1 .th-fab-snap-pips i:nth-child(-n+1) { background: #e0b13e; box-shadow: 0 0 4px rgba(224, 177, 62, 0.5); }
.th-fab-snap-card-cl.dmg2 { --cc: #dc8340; --cbg: rgba(255, 246, 236, 0.9); }
.th-fab-snap-card-cl.dmg2 .th-fab-snap-pips i:nth-child(-n+2) { background: #ef9556; box-shadow: 0 0 4px rgba(239, 149, 86, 0.5); }
.th-fab-snap-card-cl.dmg3 {
  --cc: #e2607c; --cbg: rgba(255, 242, 245, 0.92);
  box-shadow: 0 2px 8px rgba(240, 170, 190, 0.28), inset 0 1px 0 rgba(255,255,255,0.95);
}
.th-fab-snap-card-cl.dmg3 .th-fab-snap-pips i { background: #f2758f; box-shadow: 0 0 4px rgba(242, 117, 143, 0.55); }
/* 严重破坏：档名胶囊极轻呼吸，扫一眼就能从一排卡里挑出来（reduced-motion 下自动停） */
.th-fab-snap-card-cl.dmg3:not(.off) .th-fab-snap-cl-dmg { animation: th-fab-cl-pulse 2.2s ease-in-out infinite; }
@keyframes th-fab-cl-pulse {
  0%, 100% { box-shadow: 0 1px 3px rgba(226, 96, 124, 0.16); }
  50% { box-shadow: 0 1px 8px rgba(226, 96, 124, 0.42); }
}
/* 脱下：整卡灰化 + 虚线框 + 名称划掉（压过四档色阶） */
.th-fab-snap-card-cl.off,
.th-fab-snap-card-cl.off.dmg0, .th-fab-snap-card-cl.off.dmg1,
.th-fab-snap-card-cl.off.dmg2, .th-fab-snap-card-cl.off.dmg3 {
  --cc: #a294ab; --cbg: rgba(244, 240, 246, 0.7);
  background: rgba(244, 240, 246, 0.7); border: 1px dashed rgba(200, 190, 205, 0.9); box-shadow: none;
}
.th-fab-snap-card-cl.off .th-fab-snap-cl-r1 b { text-decoration: line-through; opacity: .75; }
.th-fab-snap-card-cl.off .th-fab-snap-cl-wear { color: #8d7f95; background: rgba(255,255,255,0.6); border-color: rgba(206, 196, 211, 0.9); }
.th-fab-snap-card-cl.off .th-fab-snap-pips i { background: rgba(0,0,0,0.07); }
/* 出场：以贴球那一侧为 transform-origin，「从球里长出来」而非平移淡入 */
.th-fab-pop-enter-active, .th-fab-pop-leave-active { transition: opacity .2s var(--ease-smooth, ease), transform .26s var(--ease-bounce, cubic-bezier(0.34,1.56,0.64,1)); }
.th-fab-pop-enter-from, .th-fab-pop-leave-to { opacity: 0; transform: scale(0.9); }
.th-fab-snap.on-left { transform-origin: right center; }
.th-fab-snap:not(.on-left) { transform-origin: left center; }
.th-fab-snap.on-left.th-fab-pop-enter-from, .th-fab-snap.on-left.th-fab-pop-leave-to { transform: translateX(10px) scale(0.9); }
.th-fab-snap:not(.on-left).th-fab-pop-enter-from, .th-fab-snap:not(.on-left).th-fab-pop-leave-to { transform: translateX(-10px) scale(0.9); }
/* NPC 卡 stagger 入场（--stagger 由 snapNpcStyle 给，最多累到第 7 张） */
.th-fab-snap-npc { animation: th-fab-snap-rise .34s var(--ease-smooth, ease) both; animation-delay: var(--stagger, 0ms); }
.th-fab-snap-ucard { animation: th-fab-snap-rise .3s var(--ease-smooth, ease) both; }
@keyframes th-fab-snap-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .th-fab-pop-enter-active, .th-fab-pop-leave-active { transition: opacity .12s linear; }
  .th-fab-pop-enter-from, .th-fab-pop-leave-to { transform: none; }
  .th-fab-snap-npc, .th-fab-snap-ucard { animation: none; }
  .th-fab-snap-card-cl.dmg3:not(.off) .th-fab-snap-cl-dmg { animation: none; }
  .th-fab-snap-ava, .th-fab-snap-navdot, .th-fab-snap-npc { transition: none; }
  .th-fab-snap-ava:hover, .th-fab-snap-navdot:hover, .th-fab-snap-npc:hover { transform: none; }
}
.th-fab-ball:active,
.th-fab-dock.dragging .th-fab-ball { cursor: grabbing; transform: scale(0.95); }

/* 去除呼吸光晕/浮光特效 */

/* 皮肤1 · 星梦水晶（默认）：磨砂渐变 + 内侧柔光高光环 */
.th-fab-dock[data-skin="crystal"] .th-fab-ball {
  background:
    radial-gradient(120% 120% at 32% 26%, rgba(255,255,255,0.6), rgba(255,255,255,0) 44%),
    linear-gradient(135deg, #ff8fb0, #c88aff);
  box-shadow: 0 8px 24px rgba(190,110,170,0.42), inset 0 2px 6px rgba(255,255,255,0.6), inset 0 -3px 8px rgba(150,80,140,0.35);
  --th-ball-glow: rgba(255,140,190,0.45);
}
/* 皮肤2 · 墨玉极简：深色球身 + 细亮描边 */
.th-fab-dock[data-skin="ink"] .th-fab-ball {
  background:
    radial-gradient(120% 120% at 34% 28%, rgba(160,180,230,0.4), rgba(255,255,255,0) 46%),
    radial-gradient(circle at 50% 58%, #2a2540, #14101f 70%, #0b0912);
  border-color: rgba(180,200,255,0.5);
  box-shadow: 0 8px 24px rgba(0,0,0,0.5), inset 0 1px 2px rgba(190,210,255,0.35);
  color: #eaf0ff;
  --th-ball-glow: rgba(120,150,235,0.42);
}
/* 皮肤3 · 琉璃玻璃：半透玻璃 + 流光描边环 */
.th-fab-dock[data-skin="glass"] .th-fab-ball {
  background: linear-gradient(135deg, rgba(255,255,255,0.24), rgba(255,255,255,0.06));
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  border-color: rgba(255,255,255,0.45);
  box-shadow: 0 8px 26px rgba(120,120,190,0.4), inset 0 2px 8px rgba(255,255,255,0.5);
  color: #fff;
  --th-ball-glow: rgba(180,200,255,0.4);
}

/* 卫星「世界」入口：悬停下滑淡入 */
.th-fab-sat {
  position: absolute;
  top: 62px; left: 50%;
  width: 44px; height: 44px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; padding: 0;
  color: #fff;
  border: 1px solid rgba(255,255,255,0.5);
  background: linear-gradient(135deg, #ff8fb0, #c88aff);
  box-shadow: 0 6px 16px rgba(160,100,150,0.4);
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(-8px) scale(0.7);
  transition: opacity .2s ease, transform .24s cubic-bezier(0.34,1.56,0.64,1);
}
.th-fab-sat.show { opacity: 1; pointer-events: auto; transform: translateX(-50%) translateY(0) scale(1); }
.th-fab-sat:hover { transform: translateX(-50%) translateY(0) scale(1.12); }
.th-fab-sat > svg { position: relative; z-index: 2; }
.th-fab-dock[data-skin="ink"] .th-fab-sat { background: radial-gradient(circle at 50% 55%, #2a2540, #12101c); border-color: rgba(180,200,255,0.5); color: #eaf0ff; }
.th-fab-dock[data-skin="glass"] .th-fab-sat { background: linear-gradient(135deg, rgba(255,255,255,0.24), rgba(255,255,255,0.08)); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-color: rgba(255,255,255,0.45); color: #fff; }

/* 速览卡固定独立主题（浅色糖果），不跟随世界套件皮肤：
   卡片虽是 dock 子节点，但这里不写任何 [data-skin] 覆盖，换球皮肤不改卡片配色。 */

/* 主题变量：糖果粉（面板配色，单一主题） */
.th-fab-panel {
  --th-bg:        #fff8fc;
  --th-fg:        #2d1b2e;
  --th-fg-soft:   rgba(80, 50, 70, 0.65);
  --th-fg-mute:   rgba(80, 50, 70, 0.55);
  --th-accent:    #ff5a8a;
  --th-accent-2:  #c88aff;
  --th-surface:   rgba(255, 224, 236, 0.5);
  --th-surface-2: rgba(255, 240, 246, 0.2);
  --th-divider:   rgba(212, 165, 116, 0.18);
  --th-btn-hover: rgba(255, 123, 157, 0.18);
  /* 阴影：近（贴着边框的薄阴影）+ 远（大范围散射），双层更立体 */
  --th-shadow-near: 0 2px 8px rgba(80, 30, 60, 0.12);
  --th-shadow-far:  0 18px 60px rgba(80, 30, 60, 0.28);
  --th-shadow:      var(--th-shadow-near), var(--th-shadow-far);
  /* 描边：内层白边（模拟高光）+ 外层金色雾边（暖色延伸） */
  --th-stroke-inner: 1px solid rgba(255, 255, 255, 0.55);
  --th-stroke-outer: 1px solid rgba(212, 165, 116, 0.18);
  /* 圆角分级：panel 24 / section 18 / block 14 / chip 10 */
  --th-radius-panel:   24px;
  --th-radius-section: 18px;
  --th-radius-block:   14px;
  --th-radius-chip:    10px;
  --th-ball-a:    #ff7b9d;
  --th-ball-b:    #c88aff;
  --th-ball-shadow: rgba(160, 100, 140, 0.35);
  transition: background .3s, color .3s, box-shadow .3s;
}

/* 主面板 */
.th-fab-panel {
  position: fixed;
  z-index: 99999;
  /* 圆角分级：panel 用最大档 */
  border-radius: var(--th-radius-panel);
  /* 双层描边：内白边 + 外金雾边（box-sizing: border-box 让 border 算入 width，不撑破布局） */
  border:  var(--th-stroke-inner);
  outline: var(--th-stroke-outer);
  box-sizing: border-box;
  /* 注意：不使用 backdrop-filter / transform / filter / perspective，否则会成为面板内 position:fixed
     子元素的 containing block，导致弹窗 / 悬停提示 / 大图覆盖层定位错乱。 */
  background: var(--th-bg);
  box-shadow: var(--th-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--th-fg);
  font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
}
.th-fab-panel.maximized {
  border-radius: 10px;
}
.th-fab-panel.dragging,
.th-fab-panel.resizing { user-select: none; }
/* 右皇冠折叠正文：窗口高度收成"只剩顶栏"，展开时回到 :style 的 panelH。
   缩放手柄在折叠态没有意义（高度不再由 panelH 决定）→ 只保留左右两侧。 */
.th-fab-panel.folded { height: auto !important; }
.th-fab-panel.folded .th-fab-resize.n,
.th-fab-panel.folded .th-fab-resize.s,
.th-fab-panel.folded .th-fab-resize.ne,
.th-fab-panel.folded .th-fab-resize.nw,
.th-fab-panel.folded .th-fab-resize.se,
.th-fab-panel.folded .th-fab-resize.sw { display: none; }

/* 折叠态：面板常驻但透明、不绘制、不拦截；只隐藏可见区，世界/图片 overlay 仍能弹出。
   （overlay 是 position:fixed，面板无 transform/filter → 不成 containing block、不被 overflow:hidden 裁剪，照常全屏显示） */
.th-fab-panel.collapsed {
  pointer-events: none;
  background: transparent;
  border: none;
  outline: none;
  box-shadow: none;
}
.th-fab-panel.collapsed .th-fab-panel-body,
.th-fab-panel.collapsed :deep(.th-status-wrapper) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}
.th-fab-panel.collapsed :deep(.th-topbar),
.th-fab-panel.collapsed :deep(.th-review-panel),
.th-fab-panel.collapsed :deep(.th-main-wrap) { display: none; }
/* 父级 pointer-events:none 需子级重开，折叠态里被打开的 overlay「内容」才能交互。
   注意：只重开实际交互目标（世界机身 / 弹窗卡片），遮罩背景保持穿透（世界 phone 遮罩本就 none，点空白穿透到背后聊天）。 */
.th-fab-panel.collapsed :deep(.th-modal-overlay-2 .th-modal-2),
.th-fab-panel.collapsed :deep(.th-modal-overlay .th-modal),
.th-fab-panel.collapsed :deep(.th-image-overlay .th-image-full),
.th-fab-panel.collapsed :deep(.th-image-overlay .th-image-close) { pointer-events: auto; }

/* v2：外框窄条（grip / 标题 / 最大化 / 收起）已删除，拖动手柄改成状态栏顶栏本身。
   顶栏 cursor 由 status-bar.css 的 .th-topbar 规则给（grab / grabbing），
   这里只负责「拖动中禁止选中」——见上面 .th-fab-panel.dragging。 */
.th-fab-panel.dragging :deep(.th-topbar) { cursor: grabbing; }

/* 状态栏宿主 */
.th-fab-panel-body {
  flex: 1;
  overflow: auto;
  position: relative;
  /* 让原本基于 max-height: 820px 的 .th-status-wrapper 在面板内自适应整个剩余高度 */
  display: flex;
  flex-direction: column;
}
/* 由于 .th-status-wrapper 自己有 padding/border-radius，这里给 body 透明背景由 wrapper 负责视觉 */
.th-fab-panel-body :deep(.th-status-wrapper) {
  max-height: none !important;
  width: 100% !important;
  flex: 1 1 auto;
  border-radius: 0;
  border: none;
  box-shadow: none;
}
.th-fab-panel-body :deep(.th-topbar-corner-br) { display: none; }

/* 8 方向缩放手柄 */
.th-fab-resize {
  position: absolute;
  z-index: 1;
  background: transparent;
  touch-action: none;
}
.th-fab-resize.n { left: 8px; right: 8px; top: 0; height: 6px; cursor: ns-resize; }
.th-fab-resize.s { left: 8px; right: 8px; bottom: 0; height: 6px; cursor: ns-resize; }
.th-fab-resize.e { top: 8px; bottom: 8px; right: 0; width: 6px; cursor: ew-resize; }
.th-fab-resize.w { top: 8px; bottom: 8px; left: 0; width: 6px; cursor: ew-resize; }
.th-fab-resize.ne { top: 0; right: 0; width: 12px; height: 12px; cursor: nesw-resize; }
.th-fab-resize.nw { top: 0; left: 0; width: 12px; height: 12px; cursor: nwse-resize; }
.th-fab-resize.se { bottom: 0; right: 0; width: 14px; height: 14px; cursor: nwse-resize; }
.th-fab-resize.sw { bottom: 0; left: 0; width: 12px; height: 12px; cursor: nesw-resize; }
.th-fab-resize.se::after {
  content: '';
  position: absolute;
  right: 3px; bottom: 3px;
  width: 8px; height: 8px;
  border-right: 2px solid rgba(160, 100, 140, 0.45);
  border-bottom: 2px solid rgba(160, 100, 140, 0.45);
  border-bottom-right-radius: 4px;
}

/* 过渡动画 */
.th-fab-ball-enter-active,
.th-fab-ball-leave-active { transition: opacity .18s, transform .18s; }
.th-fab-ball-enter-from,
.th-fab-ball-leave-to { opacity: 0; transform: scale(0.7); }
</style>


