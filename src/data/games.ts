// 独立游戏项目数据配置文件
// 用于管理游戏大厅（/games/）展示的独立 Web 游戏

export interface GameItem {
	id: string;
	title: string;
	description: string;
	image?: string;
	category: "puzzle" | "action" | "arcade" | "rpg" | "casual";
	categoryName: string;
	techStack: string[];
	status?: "completed" | "in-progress" | "beta";
	playUrl: string;
	openInNewTab?: boolean;
	featured?: boolean;
	badge?: string;
	author?: string;
	releaseDate?: string;
	controls?: string;
	sourceUrl?: string;
}

export const gamesData: GameItem[] = [
	{
		id: "scp-protocol-omega",
		title: "《SCP: Protocol Omega // Project Silent V2.4》",
		description:
			"基于 SCP 基金会世界观与微信 OS 仿真架构的文字解密与高压博弈互动 Web 游戏。玩家将扮演被测试员工，通过与多位 NPC 私聊及群聊互动，挖掘深藏在企业系统后台的绝密真相。",
		image: "/images/scp-cover.jpg",
		category: "puzzle",
		categoryName: "文字解密",
		techStack: ["React", "DeepSeek API", "Vite", "Web Audio"],
		status: "completed",
		playUrl: "/game/",
		openInNewTab: true,
		featured: true,
		badge: "AI驱动 · 热门",
		controls: "鼠标点击 / 文本交互",
		releaseDate: "2026-08-31",
		author: "潜水苍穹",
	},
	{
		id: "lol-career-xiagu",
		title: "《峡谷这一生 · 职业生涯模拟器》",
		description:
			"从16岁青训出发，书写属于你的峡谷传奇。覆盖全球6大主流赛区、5大核心定位与百种赛场随机抉择，冲击银龙杯与S赛全球总冠军，加冕封神入选名人堂。",
		image: "/images/xiagu-cover.jpeg",
		category: "rpg",
		categoryName: "生涯模拟",
		techStack: ["HTML5", "CSS3", "JavaScript", "LOL Esports"],
		status: "completed",
		playUrl: "/games/xiagu/",
		openInNewTab: true,
		featured: true,
		badge: "电竞赛训 · 热门",
		controls: "鼠标点击 / 触屏支持",
		releaseDate: "2026-09-08",
		author: "潜水苍穹",
	},
	{
		id: "dave-the-diver-yufu",
		title: "《潜水员戴夫 · 蓝洞的一天》",
		description:
			"潜入神秘蓝洞探险，使用鱼叉捕获各种海鲜，夜晚与班乔主厨一起经营寿司店。集深海潜水探索、鱼类图鉴收集与餐厅模拟经营于一体的像素风冒险游戏。",
		image: "/images/dave-cover.jpg",
		category: "casual",
		categoryName: "休闲模拟",
		techStack: ["HTML5 Canvas", "Web Audio", "Pixel Art", "Offline Capable"],
		status: "completed",
		playUrl: "/games/yufu/",
		openInNewTab: true,
		featured: true,
		badge: "经典像素 · 必玩",
		controls: "方向键/WASD移动 · 空格交互/抓捕",
		releaseDate: "2026-09-08",
		author: "潜水苍穹",
	},
];

// 获取游戏统计数据
export const getGameStats = () => {
	const total = gamesData.length;
	const completed = gamesData.filter((g) => g.status === "completed").length;
	const featured = gamesData.filter((g) => g.featured).length;
	const categories = Array.from(new Set(gamesData.map((g) => g.category))).length;

	return {
		total,
		completed,
		featured,
		categories,
	};
};

// 按分类获取游戏
export const getGamesByCategory = (category?: string) => {
	if (!category || category === "all") {
		return gamesData;
	}
	return gamesData.filter((g) => g.category === category);
};
