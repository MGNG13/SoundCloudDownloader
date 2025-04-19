use std::env;
use std::path::PathBuf;
use std::net::SocketAddr;
use std::time::Duration;
use std::process::Command;
use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer, Responder};
use actix_web::middleware::Logger;
use actix_web::web::Bytes;

async fn index(_req: HttpRequest, path: web::Path<String>) -> impl Responder {
    let file_path = PathBuf::from("../files/").join(path.into_inner());
    if file_path.is_file() {
        if let Ok(file_content) = tokio::fs::read(file_path).await {
            return HttpResponse::Ok()
                .content_type("application/octet-stream")
                .append_header(("Cache-Control", format!("max-age={}", Duration::from_secs(2800).as_secs())))
                .body(Bytes::from(file_content));
        }
    }
    HttpResponse::NotFound().body("File not found")
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Clear the terminal
    clear_terminal();
    let port = env::var("PORT")
        .unwrap_or_else(|_| "2000".to_string())
        .parse()
        .expect("Failed to parse PORT");
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    // Initialize the logger
    env::set_var("RUST_LOG", "actix_web=info");
    env_logger::init();
    HttpServer::new(|| App::new().wrap(Logger::default()).service(web::resource("/{file:.*}").to(index)))
        .bind(addr)?
        .run()
        .await
}

fn clear_terminal() {
    let _ = Command::new("clear").status();
    println!("Server started!");
}