"""
把 Google Sans Flex 的 slnt 轴「冻结」成真正的斜体面，并把 ss01（单层 a）并入 ccmp。

为什么要在字体文件里改，而不是靠 CSS：
  * `font-variation-settings: "slnt" -10` 是**作者级轴锁定** —— 一旦写上，wdth / opsz / wght
    的 CSS 表现（font-stretch / font-optical-sizing / font-weight）全被压住。
    实测：斜体下 font-stretch:100% 与 125% 宽度完全相同（385 vs 385），即宽度轴失效。
  * `font-feature-settings: "ss01"` 只在排版的 CSS 路径生效，canvas 的 measureText / 导出的
    位图拿不到，两边会不一致。

改法：
  1. 用 fontTools 的 instancer 把 slnt 定到 -10，其余轴（opsz / wdth / wght）保持可变
     ⇒ @font-face 只需要 font-style: italic，不再需要 font-variation-settings。
  2. 把 ss01 引用的 lookup 挂到 ccmp（所有 shaper 默认应用的特性）
     ⇒ 单层 a 成为字体默认，不需要任何 CSS。
     ⚠️ 只对**斜体**这一份做：直立体要保持双层 a。

顺序很重要：必须先子集化（本流程里由 Google 的 css2 完成），再 promote。
子集化可能把 ccmp 整个丢掉，所以 promote 要能处理「ccmp 不存在」的分支。

用法：
  python scripts/lib/gsf-italic.py <in.woff2> <out.woff2> [--check-only]
"""
import sys

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables
from fontTools.varLib import instancer

SLNT_LOCK = -10.0
# 圆角轴本方案不用，钉到默认值可以省体积（当前 GSF 的 latin 子集里没有这个轴，留作兼容）
DEAD_AXES_DEFAULT = {"ROND": 0}


def gsub_subtables(lookup):
    for st in lookup.SubTable:
        yield getattr(st, "ExtSubTable", st)


def coverage_glyphs(lookup):
    """一个 lookup 触及的所有字形名（用于安全检查）"""
    out = set()
    for st in gsub_subtables(lookup):
        cov = getattr(st, "Coverage", None)
        if cov is not None:
            out |= set(cov.glyphs)
        mapping = getattr(st, "mapping", None)
        if isinstance(mapping, dict):
            out |= set(mapping.keys())
            out |= set(mapping.values())
        alts = getattr(st, "Alternates", None)
        if isinstance(alts, dict):
            for v in alts.values():
                out |= set(v)
        lig_sets = getattr(st, "LigatureSets", None)
        if lig_sets:
            for first, lig_set in zip(st.Coverage.glyphs, lig_sets):
                out.add(first)
                for lig in lig_set.Ligature:
                    out |= set(lig.Component)
                    out.add(lig.LigGlyph)
    return out


def check_only(path):
    """安全检查：确认除了 ss01 之外没有别的特性会替换 'a'。

    若别的特性也碰 'a'（例如某个上下文规则在特定前后文里把 a 换成别的字形），
    提前到 ccmp 应用就可能破坏那条规则。
    """
    font = TTFont(path)
    gsub = font["GSUB"].table
    target = font.getBestCmap()[0x61]
    touching = {}
    for record in gsub.FeatureList.FeatureRecord:
        glyphs = set()
        for idx in record.Feature.LookupListIndex:
            glyphs |= coverage_glyphs(gsub.LookupList.Lookup[idx])
        if target in glyphs:
            touching[record.FeatureTag] = sorted(record.Feature.LookupListIndex)
    others = {k: v for k, v in touching.items() if k != "ss01"}
    print("axes: %s" % [a.axisTag for a in font["fvar"].axes])
    print("features touching '%s': %s" % (target, touching))
    if others:
        print("UNSAFE: features other than ss01 touch '%s': %s" % (target, others))
        return False
    print("SAFE: only ss01 touches 'a'")
    return True


def freeze_axes(font):
    """把 slnt 冻结成固定值，其余轴保持可变"""
    axes = {a.axisTag: a for a in font["fvar"].axes}
    limits = {}
    if "slnt" in axes:
        low, high = axes["slnt"].minValue, axes["slnt"].maxValue
        limits["slnt"] = max(low, min(high, SLNT_LOCK))
    for tag, value in DEAD_AXES_DEFAULT.items():
        if tag in axes:
            limits[tag] = value
    if not limits:
        raise SystemExit("no slnt/ROND axis, nothing to freeze")
    instancer.instantiateVariableFont(font, limits, inplace=True, updateFontNames=False)
    return limits


def promote_ss01_to_ccmp(font):
    """把 ss01 引用的 lookup 挂到 ccmp；ccmp 不存在时新建并注册到每个 LangSys"""
    gsub = font["GSUB"].table
    records = gsub.FeatureList.FeatureRecord

    wanted = set()
    for record in records:
        if record.FeatureTag == "ss01":
            wanted.update(record.Feature.LookupListIndex)
    if not wanted:
        return False, "ss01 missing (dropped by subsetting?)"

    ccmp_index = None
    for i, record in enumerate(records):
        if record.FeatureTag == "ccmp":
            ccmp_index = i
            # lookups 列表要求按索引升序
            merged = sorted(set(record.Feature.LookupListIndex) | wanted)
            record.Feature.LookupListIndex = merged
            record.Feature.LookupCount = len(merged)

    created = False
    if ccmp_index is None:
        new_record = otTables.FeatureRecord()
        new_record.FeatureTag = "ccmp"
        new_record.Feature = otTables.Feature()
        new_record.Feature.FeatureParams = None
        new_record.Feature.LookupListIndex = sorted(wanted)
        new_record.Feature.LookupCount = len(new_record.Feature.LookupListIndex)
        records.append(new_record)
        gsub.FeatureList.FeatureCount = len(records)
        ccmp_index = len(records) - 1
        created = True

        # ⚠️ 新建的 FeatureRecord 必须注册进每个 LangSys 的 FeatureIndex，
        #    否则这个特性永远不会被应用（ccmp 要在所有 script 下都生效）。
        for script_record in gsub.ScriptList.ScriptRecord:
            script = script_record.Script
            lang_systems = []
            if script.DefaultLangSys:
                lang_systems.append(script.DefaultLangSys)
            lang_systems += [lr.LangSys for lr in script.LangSysRecord]
            for lang_sys in lang_systems:
                if ccmp_index not in lang_sys.FeatureIndex:
                    lang_sys.FeatureIndex.append(ccmp_index)
                    lang_sys.FeatureIndex.sort()
                    lang_sys.FeatureCount = len(lang_sys.FeatureIndex)

    note = "ss01 lookups %s -> ccmp (%s)" % (sorted(wanted), "created ccmp" if created else "appended to existing ccmp")
    return True, note


def main(argv):
    if len(argv) < 3:
        raise SystemExit(__doc__)
    src, dst = argv[1], argv[2]
    if "--check-only" in argv:
        raise SystemExit(0 if check_only(src) else 1)

    if not check_only(src):
        raise SystemExit(1)

    font = TTFont(src)
    limits = freeze_axes(font)
    promoted, note = promote_ss01_to_ccmp(font)
    if not promoted:
        raise SystemExit("FAILED: " + note)

    font.flavor = "woff2"
    font.save(dst)
    print("freeze axes: %s / %s" % (limits, note))
    print("wrote %s" % dst)


if __name__ == "__main__":
    main(sys.argv)
