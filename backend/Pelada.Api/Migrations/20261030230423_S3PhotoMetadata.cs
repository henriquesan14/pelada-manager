using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pelada.Api.Migrations
{
    /// <inheritdoc />
    public partial class S3PhotoMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BucketName",
                table: "RentalPhotos",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ObjectKey",
                table: "RentalPhotos",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Region",
                table: "RentalPhotos",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BucketName",
                table: "RentalPhotos");

            migrationBuilder.DropColumn(
                name: "ObjectKey",
                table: "RentalPhotos");

            migrationBuilder.DropColumn(
                name: "Region",
                table: "RentalPhotos");
        }
    }
}
