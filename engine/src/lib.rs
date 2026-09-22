use wasm_bindgen::prelude::*;
use acadrust::{DxfReader, DxfWriter, DwgReader, DwgWriter};
use std::io::Cursor;

fn js_error(e: impl std::fmt::Display) -> JsValue { JsValue::from_str(&e.to_string()) }

#[wasm_bindgen]
pub fn dxf_to_dwg(input: &[u8]) -> Result<Vec<u8>, JsValue> {
    let doc = DxfReader::from_reader(Cursor::new(input.to_vec())).map_err(js_error)?.read().map_err(js_error)?;
    DwgWriter::write_to_vec(&doc).map_err(js_error)
}

#[wasm_bindgen]
pub fn dwg_to_dxf(input: &[u8]) -> Result<Vec<u8>, JsValue> {
    let doc = DwgReader::from_stream(Cursor::new(input.to_vec())).read().map_err(js_error)?;
    DxfWriter::new(&doc).write_to_vec().map_err(js_error)
}

#[wasm_bindgen]
pub fn version() -> String { "acadrust 0.5.5".to_string() }
