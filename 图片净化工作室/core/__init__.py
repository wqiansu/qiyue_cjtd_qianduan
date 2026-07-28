"""图片净化工作室 - 核心引擎

引擎与界面分离。core 包只用 Python 标准库(png_surgery/inspector/jpeg_webp/
extractor/pipeline 均不依赖第三方库),Pillow 仅在可选的缩略图/格式转换处按需导入。
这样即便打包环境缺库,核心清理能力也永远可用,也便于单元测试。
"""
